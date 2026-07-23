import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { evaluateMathExpression } from '../../utils/safeMathParser.js';

const calculationContexts = new Map();

function evaluate(expression) {
    return evaluateMathExpression(expression);
}

const calculationHistory = new Map();
const MAX_HISTORY = 5;

export { calculationContexts };

export default {
    data: new SlashCommandBuilder()
        .setName("calculate")
        .setDescription("Évaluer une expression mathématique")
        .addStringOption((option) =>
            option
                .setName("expression")
                .setDescription(
                    "L'expression mathématique à évaluer (ex. : 2+2*3, sin(45 deg), 16^0.5)",
                )
                .setRequired(true),
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Échec du report de l'interaction Calculate`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'calculate'
            });
            return;
        }

        const expression = interaction.options.getString("expression");

        if (
            !/^[0-9+\-*/.()^%! ,<>=&|~?:\[\]{}a-z√π∞°]+$/i.test(expression)
        ) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: '**L\'expression contient des caractères non pris en charge.**\n\n' +
                    '✅ **Pris en charge :** Nombres, décimales, + - * / ^ %, sin cos tan sqrt abs log exp, pi e, ()\n' +
                    '❌ **Non pris en charge :** Crochets, accolades et autres symboles'
            });
        }

        const dangerousPatterns = [
            /\b(?:import|require|process|fs|child_process|exec|eval|Function|setTimeout|setInterval|new\s+Function)\s*\(/i,
            /`/g,
            /\$\{.*\}/,
            /\b(?:localStorage|document|window|fetch|XMLHttpRequest)\b/,
            /\b(?:while|for)\s*\([^)]*\)\s*\{/,
            /\b(?:function\*|yield|await|async)\b/,
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(expression)) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: '**L\'expression contient du code bloqué.**\n\n' +
                        '🚫 **Bloqué :** import, require, eval, Function, setTimeout, setInterval, process, fs, document, window, fetch, boucles, async/await\n\n' +
                        'La syntaxe ressemblant à du code n\'est pas autorisée dans les calculs.'
                });
            }
        }

        let result;
        try {
            result = evaluate(expression);

            let formattedResult;
            if (typeof result === "number") {
                formattedResult = result.toLocaleString("fr-FR", {
                    maximumFractionDigits: 10,
                });

                if (
                    Math.abs(result) > 0 &&
                    (Math.abs(result) >= 1e10 || Math.abs(result) < 1e-3)
                ) {
                    formattedResult = result.toExponential(6);
                }
            } else if (typeof result === "boolean") {
                formattedResult = result ? "vrai" : "faux";
            } else if (result === null || result === undefined) {
                formattedResult = "Aucun résultat";
            } else if (
                Array.isArray(result) ||
                typeof result === "object"
            ) {
                formattedResult =
                    "```json\n" + JSON.stringify(result, null, 2) + "\n```";
            } else {
                formattedResult = String(result);
            }

            const userId = interaction.user.id;
            if (!calculationHistory.has(userId)) {
                calculationHistory.set(userId, []);
            }

            const history = calculationHistory.get(userId);
            history.unshift({
                expression,
                result: formattedResult,
                timestamp: Date.now(),
            });

            if (history.length > MAX_HISTORY) {
                history.pop();
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_add`)
                    .setLabel("+")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_subtract`)
                    .setLabel("-")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_multiply`)
                    .setLabel("×")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_divide`)
                    .setLabel("÷")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_history`)
                    .setLabel("Historique")
                    .setStyle(ButtonStyle.Secondary),
            );

            const embed = successEmbed(
                "🧮 Résultat du calcul",
                `**Expression :** \`${expression.replace(/`/g, "\`")}\`\n` +
                    `**Résultat :** \`${formattedResult}\`\n\n` +
                    `*Utilisez les boutons ci-dessous pour effectuer des opérations avec le résultat.*`,
            );

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
                components: [row],
            });

            const filter = (i) =>
                i.customId.startsWith(`calc_${interaction.id}`) &&
                i.user.id === interaction.user.id;
            const BUTTON_TIMEOUT = 300000;
            const collector =
                interaction.channel.createMessageComponentCollector({
                    filter,
                    time: BUTTON_TIMEOUT,
                });

            collector.on("collect", async (i) => {
                try {
                    const operation = i.customId.split("_")[2];

                    if (operation === "history") {
                        if (!i.deferred && !i.replied) {
                            await i.deferUpdate().catch(console.error);
                        }

                        const userHistory =
                            calculationHistory.get(userId) || [];

                        if (userHistory.length === 0) {
                            await i.followUp({
                                content: "Aucun historique de calcul trouvé.",
                                flags: ["Ephemeral"],
                            });
                            return;
                        }

                        const historyText = userHistory
                            .map(
                                (item, index) =>
                                    `${index + 1}. **${item.expression}** = \`${item.result}\`\n` +
                                    `<t:${Math.floor(item.timestamp / 1000)}:R>`,
                            )
                            .join("\n\n");

                        await i.followUp({
                            content: `📜 **Votre historique de calcul**\n\n${historyText}`,
                            flags: ["Ephemeral"],
                        });
                        return;
                    }

                    let operator = "";

                    switch (operation) {
                        case "add":
                            operator = "+";
                            break;
                        case "subtract":
                            operator = "-";
                            break;
                        case "multiply":
                            operator = "*";
                            break;
                        case "divide":
                            operator = "/";
                            break;
                    }

                    try {
                        const contextKey = `${i.user.id}_${operation}`;
                        calculationContexts.set(contextKey, {
                            expression,
                            formattedResult,
                            operator,
                            messageId: interaction.message?.id,
                            channelId: interaction.channelId,
                            userId: i.user.id
                        });

                        await i.showModal({
                            customId: `calc_modal:${operation}`,
                            title: `Entrez un nombre à ${operation}`,
                            components: [
                                {
                                    type: 1,
                                    components: [
                                        {
                                            type: 4,
                                            customId: `operand:${contextKey}`,
                                            label: `Nombre à ${operator} avec ${formattedResult}`,
                                            placeholder: "Entrez un nombre...",
                                            style: 1,
                                            required: true,
                                            maxLength: 50,
                                        },
                                    ],
                                },
                            ],
                        });
                    } catch (modalError) {
                        logger.error("Échec de l'affichage du formulaire :", modalError);
                        if (!i.replied && !i.deferred) {
                            await i.reply({
                                content: "Impossible d'ouvrir la calculatrice. Veuillez réessayer.",
                                flags: ["Ephemeral"],
                            }).catch(console.error);
                        }
                        return;
                    }

                } catch (error) {
                    logger.error("Erreur lors de l'interaction avec le bouton :", error);
                    if (!i.deferred && !i.replied) {
                        await i.followUp({
                            content: "Une erreur est survenue lors du traitement de votre demande.",
                            flags: ["Ephemeral"],
                        }).catch(console.error);
                    }
                }
            });

            collector.on("end", (collected, reason) => {
                if (reason === "timeout") {
                    const disabledRow =
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    `calc_${interaction.id}_expired`,
                                )
                                .setLabel("Calculatrice expirée")
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true),
                        );

                    interaction
                        .editReply({
                            components: [disabledRow],
                            content:
                                "⏱️ Cette calculatrice a expiré. Utilisez à nouveau la commande pour effectuer d'autres calculs.",
                        })
                        .catch(console.error);
                } else {
                    const disabledRow = ActionRowBuilder.from(
                        row,
                    ).setComponents(
                        row.components.map((component) =>
                            ButtonBuilder.from(component).setDisabled(true),
                        ),
                    );

                    interaction
                        .editReply({ components: [disabledRow] })
                        .catch(console.error);
                }
            });
        } catch (error) {
            logger.error('Erreur de calcul :', error);

            let errorMessage = 'Impossible d\'évaluer l\'expression.';

            if (error.message.includes('Unexpected type')) {
                errorMessage +=
                    ' L\'expression contient une opération ou une fonction non prise en charge.';
            } else if (error.message.includes('Undefined symbol')) {
                errorMessage +=
                    ' L\'expression contient une variable ou une fonction indéfinie.';
            } else if (error.message.includes('Brackets not balanced')) {
                errorMessage += ' L\'expression contient des parenthèses déséquilibrées.';
            } else if (
                error.message.includes('Unexpected operator') ||
                error.message.includes('Unexpected character')
            ) {
                errorMessage +=
                    ' L\'expression contient un opérateur ou un caractère invalide.';
            } else {
                errorMessage += ' Vérifiez la syntaxe et réessayez.';
            }

            await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: errorMessage,
            });
        }
    },
};

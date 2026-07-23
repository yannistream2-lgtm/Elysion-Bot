import { successEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { evaluateMathExpression } from '../utils/safeMathParser.js';

import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';

function evaluate(expression) {
    return evaluateMathExpression(expression);
}

async function calculateModalHandler(interaction, client, args) {
    try {
        const operation = args[0];
        const operandInput = interaction.fields.first();
        const contextKey = operandInput?.customId?.split(':')[1];

        if (!contextKey) {
            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Impossible de récupérer le contexte du calcul.'
            });
        }

        const { calculationContexts } = await import('../commands/Tools/calculate.js');
        const context = calculationContexts.get(contextKey);

        if (!context) {
            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Ce calcul a expiré. Veuillez commencer un nouveau calcul.'
            });
        }

        await interaction.deferReply({ ephemeral: false });

        const operand = interaction.fields.getTextInputValue(operandInput.customId);

        if (!operand || isNaN(operand)) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Veuillez fournir un nombre valide.'
            });
        }

        const { expression, formattedResult, operator } = context;
        const newExpression = `(${expression}) ${operator} (${operand})`;

        let newResult;

        try {
            newResult = evaluate(newExpression);

            let formattedNewResult;

            if (typeof newResult === 'number') {
                formattedNewResult = newResult.toLocaleString('fr-FR', {
                    maximumFractionDigits: 10,
                });

                if (
                    Math.abs(newResult) > 0 &&
                    (Math.abs(newResult) >= 1e10 || Math.abs(newResult) < 1e-3)
                ) {
                    formattedNewResult = newResult.toExponential(6);
                }
            } else {
                formattedNewResult = String(newResult);
            }

            const updatedEmbed = successEmbed(
                '🧮 Résultat du calcul',
                `**Expression :** \`${newExpression.replace(/`/g, '\\`')}\`\n` +
                    `**Résultat :** \`${formattedNewResult}\`\n\n` +
                    `*Utilisez les boutons du message dans le salon pour effectuer d'autres opérations.*`,
            );

            try {
                if (context.messageId && context.channelId) {
                    const channel = await client.channels.fetch(context.channelId);
                    const message = await channel.messages.fetch(context.messageId);

                    await message.edit({
                        embeds: [updatedEmbed],
                    });
                }
            } catch (editError) {
                logger.warn(
                    'Impossible de modifier le message original :',
                    editError.message
                );
            }

            calculationContexts.delete(contextKey);

            await interaction.editReply({
                embeds: [
                    successEmbed(
                        '✅ Calcul effectué',
                        `\`${newExpression}\` = \`${formattedNewResult}\``
                    )
                ],
            });

        } catch (calcError) {
            logger.error('Erreur lors de l\'évaluation du calcul :', calcError);

            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Impossible d\'évaluer l\'expression.'
            });
        }

    } catch (error) {
        logger.error('Erreur du gestionnaire de calcul :', error);

        try {
            if (!interaction.replied && !interaction.deferred) {
                await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Une erreur est survenue lors du traitement de votre calcul.'
                });
            } else {
                await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Une erreur est survenue lors du traitement de votre calcul.'
                });
            }
        } catch (err) {
            logger.error(
                'Impossible d\'envoyer le message d\'erreur :',
                err
            );
        }
    }
}

export default {
    execute: calculateModalHandler
};

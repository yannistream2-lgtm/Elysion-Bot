import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("shorten")
        .setDescription("Raccourcir une URL avec is.gd")
        .addStringOption(option =>
            option
                .setName("url")
                .setDescription("L'URL à raccourcir")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("custom")
                .setDescription("Fin d'URL personnalisée (facultatif)")
                .setRequired(false)
        )
        .setDMPermission(false),

    category: "Outils",

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral
        });

        if (!deferSuccess) {
            logger.warn(`Échec du report de l'interaction Shorten`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'shorten'
            });
            return;
        }

        const url = interaction.options.getString("url");
        const custom = interaction.options.getString("custom");

        try {
            new URL(url);
        } catch (e) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Format d’URL invalide. Incluez http:// ou https://',
            });
        }

        if (custom && !/^[a-zA-Z0-9_-]+$/.test(custom)) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'L’URL personnalisée peut uniquement contenir des lettres, des chiffres, des underscores et des tirets.',
            });
        }

        let apiUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`;

        if (custom) {
            apiUrl += `&shorturl=${encodeURIComponent(custom)}`;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        let response;

        try {
            response = await fetch(apiUrl, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'TitanBot URL Shortener/1.0'
                }
            });
        } catch (networkError) {
            const message = networkError?.name === 'AbortError'
                ? 'Le service de raccourcissement a mis trop de temps à répondre. Veuillez réessayer dans quelques instants.'
                : 'Impossible de contacter le service de raccourcissement pour le moment. Veuillez réessayer plus tard.';

            return replyUserError(interaction, {
                type: ErrorTypes.NETWORK,
                message,
            });
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            return replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: `Le service de raccourcissement a renvoyé l’erreur HTTP ${response.status}. Veuillez réessayer plus tard.`,
            });
        }

        const shortUrl = await response.text();

        try {
            new URL(shortUrl);
        } catch (e) {
            if (shortUrl.includes("already exists")) {
                return replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Cette URL personnalisée est déjà utilisée. Essayez-en une autre.',
                });
            } else if (shortUrl.includes("invalid")) {
                return replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'URL invalide. Incluez http:// ou https://',
                });
            }

            return replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: `Le raccourcissement de l’URL a échoué : ${shortUrl}`,
            });
        }

        const embed = successEmbed(
            'URL raccourcie',
            `Voici votre URL raccourcie : ${shortUrl}`
        );

        embed.setColor(getColor('success'));

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed],
        });
    },
};

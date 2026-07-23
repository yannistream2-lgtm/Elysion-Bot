import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('time')
        .setDescription('Obtenir l’heure actuelle dans différents fuseaux horaires')
        .addStringOption(option =>
            option.setName('timezone')
                .setDescription('Le fuseau horaire à afficher (ex. : UTC, America/New_York)')
                .setRequired(false)),

    async execute(interaction) {
        await InteractionHelper.safeExecute(
            interaction,
            async () => {
                const timezone = interaction.options.getString('timezone') || 'UTC';

                let timeString;

                try {
                    timeString = new Date().toLocaleString('fr-FR', {
                        timeZone: timezone,
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZoneName: 'short'
                    });
                } catch (error) {
                    logger.warn(`Fuseau horaire invalide demandé : ${timezone}`);

                    await replyUserError(interaction, {
                        type: ErrorTypes.VALIDATION,
                        message: 'Fuseau horaire invalide. Veuillez utiliser un identifiant de fuseau horaire valide (ex. : UTC, America/New_York, Europe/London)',
                    });

                    return;
                }

                const now = new Date();
                const unixTimestamp = Math.floor(now.getTime() / 1000);

                const embed = successEmbed(
                    '🕒 Heure actuelle',
                    `**${timezone} :** ${timeString}\n` +
                    `**Horodatage Unix :** \`${unixTimestamp}\`\n` +
                    `**Chaîne ISO :** \`${now.toISOString()}\``
                );

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed]
                });
            },
            'Impossible d’obtenir l’heure actuelle. Veuillez réessayer.',
            {
                autoDefer: true,
                deferOptions: {
                    flags: MessageFlags.Ephemeral
                }
            }
        );
    },
};

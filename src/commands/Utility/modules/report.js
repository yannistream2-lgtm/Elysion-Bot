import { createEmbed } from '../../../utils/embeds.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { logEvent, EVENT_TYPES, resolveLogChannel } from '../../../services/loggingService.js';
import { formatLogLine, resolveUserAuthor } from '../../../utils/logging/logEmbeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });

        if (!deferSuccess) {
            logger.warn('Échec du report de l’interaction du signalement', {
                userId: interaction.user.id,
                guildId: interaction.guildId
            });
            return;
        }

        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const guildId = interaction.guildId;

        const guildConfig = await getGuildConfig(client, guildId);
        const reportChannelId = resolveLogChannel(guildConfig, 'reports');

        if (!reportChannelId) {
            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Le salon des signalements n’a pas encore été configuré. Demandez à un modérateur d’utiliser `/logging dashboard` ou `/logging channel`.'
            });
        }

        const ownerMention = interaction.guild.ownerId
            ? `<@${interaction.guild.ownerId}> Nouveau signalement !`
            : 'Nouveau signalement !';

        await logEvent({
            client,
            guildId,
            eventType: EVENT_TYPES.REPORT_FILE,
            content: ownerMention,
            data: {
                title: 'Signalement d’un utilisateur',
                lines: [
                    formatLogLine(
                        'Utilisateur signalé',
                        `${targetUser.tag} (\`${targetUser.id}\`)`
                    ),
                    formatLogLine(
                        'Signalé par',
                        `${interaction.user.tag} (\`${interaction.user.id}\`)`
                    ),
                    formatLogLine(
                        'Salon',
                        interaction.channel.toString()
                    ),
                ],
                blockFields: [
                    {
                        name: 'Raison',
                        value: reason
                    }
                ],
                author: await resolveUserAuthor(client, targetUser.id),
                thumbnail: targetUser.displayAvatarURL(),
            },
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                createEmbed({
                    title: 'Signalement envoyé',
                    description: `Votre signalement concernant **${targetUser.tag}** a bien été enregistré et transmis à l’équipe de modération. Merci !`,
                })
            ],
        });

        logger.info('Signalement envoyé', {
            userId: interaction.user.id,
            reportedUserId: targetUser.id,
            guildId,
            reasonLength: reason.length,
        });
    },
};

import { PermissionsBitField } from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
import { setLogChannel } from '../../../services/loggingService.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: 'Vous devez avoir la permission **Gérer le serveur** pour définir le salon des signalements.'
            });
        }

        const channel = interaction.options.getChannel('channel');
        const guildId = interaction.guildId;

        try {
            await setLogChannel(client, guildId, 'reports', channel.id);

            return InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed(
                    'Salon des signalements configuré',
                    `Tous les nouveaux signalements seront désormais envoyés dans ${channel}.\nVous pouvez également gérer cette configuration depuis \`/logging dashboard\`.`,
                )],
                ephemeral: true,
            });
        } catch (error) {
            logger.error('Erreur lors de la configuration du salon des signalements :', error);

            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Impossible d\'enregistrer la configuration du salon.'
            });
        }
    },
};

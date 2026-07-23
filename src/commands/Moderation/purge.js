import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("purge")
        .setDescription("Supprimer un nombre spécifique de messages")
        .addIntegerOption((option) =>
            option
                .setName("amount")
                .setDescription("Nombre de messages à supprimer (1-100)")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    category: "moderation",

    abuseProtection: {
        maxAttempts: 5,
        windowMs: 60_000
    },

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });

        if (!deferSuccess) {
            logger.warn(`Échec du defer de l'interaction Purge`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'purge'
            });

            return;
        }

        const amount = interaction.options.getInteger("amount");
        const channel = interaction.channel;

        if (amount < 1 || amount > 100) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Veuillez spécifier un nombre compris entre **1 et 100**.'
            });
        }

        try {
            const fetched = await channel.messages.fetch({
                limit: amount
            });

            const deleted = await channel.bulkDelete(
                fetched,
                true
            );

            const deletedCount = deleted.size;

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "Messages supprimés",
                    target: `${channel} (${deletedCount} messages)`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `Suppression de ${deletedCount} messages`,

                    metadata: {
                        channelId: channel.id,
                        messageCount: deletedCount,
                        requestedAmount: amount,
                        moderatorId: interaction.user.id
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "Messages supprimés",
                        `${deletedCount} message${deletedCount !== 1 ? 's ont été supprimés' : ' a été supprimé'} dans ${channel}.`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });

            setTimeout(() => {
                interaction.deleteReply().catch(err =>
                    logger.debug(
                        'Échec de la suppression automatique de la réponse Purge :',
                        err
                    )
                );
            }, 3000);

        } catch (error) {
            logger.error(
                'Erreur lors de l’exécution de la commande Purge :',
                error
            );

            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Une erreur inattendue est survenue lors de la suppression des messages. Note : les messages datant de plus de **14 jours** ne peuvent pas être supprimés en masse.'
            });
        }
    }
};


import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("lock")
        .setDescription(
            "Verrouiller le salon actuel (empêche @everyone d'envoyer des messages).",
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn(`Échec du verrouillage du salon`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'lock'
            });
            return;
        }

        const channel = interaction.channel;
        const everyoneRole = interaction.guild.roles.everyone;

        try {
            // Vérifier si le salon est déjà verrouillé
            const currentPermissions = channel.permissionsFor(everyoneRole);

            if (currentPermissions.has(PermissionFlagsBits.SendMessages) === false) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: `${channel} est déjà verrouillé.`
                });
            }

            // Empêcher @everyone d'envoyer des messages
            await channel.permissionOverwrites.edit(
                everyoneRole,
                { SendMessages: false },
                {
                    type: 0,
                    reason: `Salon verrouillé par ${interaction.user.tag}`
                },
            );

            // Enregistrer l'action dans les logs
            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "Salon verrouillé",
                    target: channel.toString(),
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: {
                        channelId: channel.id,
                        category: channel.parent?.name || 'Aucune',
                        moderatorId: interaction.user.id
                    }
                }
            });

            // Envoyer la confirmation
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `🔒 **Salon verrouillé**`,
                        `${channel} est maintenant verrouillé. Personne ne peut envoyer de messages ici.`
                    ),
                ],
            });

        } catch (error) {
            logger.error('Erreur de la commande lock :', error);

            await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message: 'Une erreur inattendue est survenue lors du verrouillage du salon. Vérifiez mes permissions (j’ai besoin de la permission « Gérer les salons »).'
            });
        }
    }
};
```

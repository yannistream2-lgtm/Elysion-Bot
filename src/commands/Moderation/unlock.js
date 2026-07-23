import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
data: new SlashCommandBuilder()
.setName("unlock")
.setDescription(
"Déverrouille le salon actuel (permet à @everyone d'envoyer à nouveau des messages).",
)
.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

```
category: "moderation",

async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);

    if (!deferSuccess) {
        logger.warn(`Échec de la réponse différée de l'interaction unlock`, {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            commandName: 'unlock'
        });
        return;
    }

    const channel = interaction.channel;
    const everyoneRole = interaction.guild.roles.everyone;

    try {
        const currentPermissions = channel.permissionsFor(everyoneRole);

        if (
            currentPermissions.has(PermissionFlagsBits.SendMessages) === true ||
            currentPermissions.has(PermissionFlagsBits.SendMessages) === null
        ) {
            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: `${channel} n'est pas explicitement verrouillé (@everyone peut déjà envoyer des messages).`
            });
        }

        await channel.permissionOverwrites.edit(
            everyoneRole,
            { SendMessages: true },
            {
                type: 0,
                reason: `Salon déverrouillé par ${interaction.user.tag}`,
            },
        );

        await logEvent({
            client,
            guild: interaction.guild,
            event: {
                action: "Channel Unlocked",
                target: channel.toString(),
                executor: `${interaction.user.tag} (${interaction.user.id})`,
                metadata: {
                    channelId: channel.id,
                    category: channel.parent?.name || 'Aucune'
                }
            }
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    `🔓 **Salon déverrouillé**`,
                    `${channel} est maintenant déverrouillé. Vous pouvez à nouveau parler dans ce salon.`,
                ),
            ],
        });

    } catch (error) {
        logger.error('Erreur de la commande unlock :', error);

        await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'Une erreur inattendue s\'est produite lors du déverrouillage du salon. Vérifiez mes permissions (j\'ai besoin de la permission **Gérer les salons**).'
        });
    }
}
```

};

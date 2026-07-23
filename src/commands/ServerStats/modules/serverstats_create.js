```js
import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { createEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, updateCounter, getCounterBaseName, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

export async function handleCreate(interaction, client) {
    const guild = interaction.guild;
    const type = interaction.options.getString("type");
    const channelType = interaction.options.getString("channel_type");
    const category = interaction.options.getChannel("category");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Échec du report de la réponse :", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'Vous devez avoir la permission **Gérer les salons** pour créer des compteurs.'
        }).catch(logger.error);
        return;
    }

    try {
        if (!category || category.type !== ChannelType.GuildCategory) {
            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Veuillez sélectionner une catégorie valide pour le salon du compteur.'
            }).catch(logger.error);
            return;
        }

        const targetChannelType = channelType === 'voice'
            ? ChannelType.GuildVoice
            : ChannelType.GuildText;

        const baseChannelName = getCounterBaseName(type);

        const counters = await getServerCounters(client, guild.id);

        const duplicateType = counters.find(counter => counter.type === type);

        if (duplicateType) {
            const duplicateChannel = guild.channels.cache.get(duplicateType.channelId);

            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: `Un compteur **${getCounterTypeLabel(type)}** existe déjà sur ce serveur${duplicateChannel ? ` dans ${duplicateChannel}` : ''}. Supprimez-le avant d'en créer un autre.`
            }).catch(logger.error);

            return;
        }

        const targetChannel = await guild.channels.create({
            name: baseChannelName,
            type: targetChannelType,
            parent: category.id,
            reason: `Salon de compteur créé par ${interaction.user.tag}`
        });

        const existingCounter = counters.find(c => c.channelId === targetChannel.id);

        if (existingCounter) {
            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: `Un compteur existe déjà pour le salon **${targetChannel.name}**. Supprimez-le avant ou choisissez un autre type.`
            }).catch(logger.error);

            return;
        }

        const newCounter = {
            id: Date.now().toString(),
            type: type,
            channelId: targetChannel.id,
            guildId: guild.id,
            createdAt: new Date().toISOString(),
            enabled: true
        };

        counters.push(newCounter);

        const saved = await saveServerCounters(client, guild.id, counters);

        if (!saved) {
            await targetChannel.delete('La création du compteur a échoué lors de la sauvegarde').catch(() => null);

            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Impossible de sauvegarder les données du compteur. Veuillez réessayer.'
            }).catch(logger.error);

            return;
        }

        const updated = await updateCounter(client, guild, newCounter);

        if (!updated) {
            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Le compteur a été créé, mais la mise à jour du nom du salon a échoué. Le compteur sera mis à jour lors de la prochaine actualisation programmée.'
            }).catch(logger.error);

            return;
        }

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    `**Compteur créé avec succès !**\n\n` +
                    `**Type :** ${getCounterTypeLabel(type)}\n` +
                    `**Type de salon :** ${targetChannel.type === ChannelType.GuildVoice ? 'vocal' : 'textuel'}\n` +
                    `**Catégorie :** ${category}\n` +
                    `**Salon :** ${targetChannel}\n` +
                    `**Nom du salon :** ${targetChannel.name}\n` +
                    `**ID du compteur :** \`${newCounter.id}\`\n\n` +
                    `Le compteur sera automatiquement mis à jour toutes les 15 minutes.\n\n` +
                    `Utilisez \`/serverstats list\` pour afficher tous les compteurs.`
                )
            ]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Erreur lors de la création du compteur :", error);

        await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Une erreur est survenue lors de la création du compteur. Veuillez réessayer.'
        }).catch(logger.error);
    }
}
```

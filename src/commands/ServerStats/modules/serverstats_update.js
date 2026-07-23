import { PermissionFlagsBits } from 'discord.js';
import { createEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, updateCounter, getCounterEmoji, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

export async function handleUpdate(interaction, client) {
    const guild = interaction.guild;
    const counterId = interaction.options.getString("counter-id");
    const newType = interaction.options.getString("type");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Échec du report de réponse :", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Vous avez besoin de la permission **Gérer les salons** pour modifier les compteurs.' }).catch(logger.error);
        return;
    }

    if (!newType) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Vous devez fournir un nouveau type de compteur à appliquer.' }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        const counterIndex = counters.findIndex(c => c.id === counterId);
        if (counterIndex === -1) {
            await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `Le compteur avec l'identifiant \`${counterId}\` est introuvable. Utilisez \`/serverstats list\` pour voir tous les compteurs.` }).catch(logger.error);
            return;
        }

        const counter = counters[counterIndex];
        const oldChannel = guild.channels.cache.get(counter.channelId);

        if (!oldChannel) {
            await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'Le salon associé à ce compteur n’existe plus. Vous ne pouvez pas modifier un compteur lié à un salon supprimé.' }).catch(logger.error);
            return;
        }

        if (newType !== counter.type) {
            const existingTypeCounter = counters.find(c => c.type === newType && c.id !== counter.id);
            if (existingTypeCounter) {
                const existingChannel = guild.channels.cache.get(existingTypeCounter.channelId);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Un compteur **${getCounterTypeLabel(newType)}** existe déjà sur ce serveur${existingChannel ? ` dans ${existingChannel}` : ''}. Supprimez-le avant de réutiliser ce type.` }).catch(logger.error);
                return;
            }
        }

        const oldType = counter.type;

        counter.type = newType;
        counter.updatedAt = new Date().toISOString();

        const saved = await saveServerCounters(client, guild.id, counters);
        if (!saved) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Impossible d’enregistrer les données mises à jour du compteur. Veuillez réessayer.' }).catch(logger.error);
            return;
        }

        const updatedCounter = counters[counterIndex];
        const updated = await updateCounter(client, guild, updatedCounter);

        if (!updated) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Le compteur a été mis à jour mais le nom du salon n’a pas pu être modifié. Il sera mis à jour lors de la prochaine actualisation automatique.' }).catch(logger.error);
            return;
        }

        const finalChannel = guild.channels.cache.get(updatedCounter.channelId);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(`**Compteur mis à jour avec succès !**\n\n**Identifiant du compteur :** \`${counterId}\`\n**Type modifié :** ${getCounterEmoji(oldType)} ${getCounterTypeLabel(oldType)} → ${getCounterEmoji(newType)} ${getCounterTypeLabel(newType)}\n\n**Configuration actuelle :**\n**Type :** ${getCounterEmoji(updatedCounter.type)} ${getCounterTypeLabel(updatedCounter.type)}\n**Salon :** ${finalChannel}\n**Nom du salon :** ${finalChannel.name}\n\nLe compteur sera automatiquement mis à jour toutes les 15 minutes.`)]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Erreur lors de la mise à jour du compteur :", error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Une erreur est survenue lors de la mise à jour du compteur. Veuillez réessayer.' }).catch(logger.error);
    }
}

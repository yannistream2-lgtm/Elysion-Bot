
import { getColor } from '../../../config/bot.js';
import { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, getCounterEmoji, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes, createError, wrapServiceBoundary } from '../../../utils/errorHandler.js';

export async function handleDelete(interaction, client) {
    const guild = interaction.guild;
    const counterId = interaction.options.getString("counter-id");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Échec du report de la réponse :", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'Vous devez avoir la permission **Gérer les salons** pour supprimer des compteurs.'
        }).catch(logger.error);

        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        if (counters.length === 0) {
            await replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'Aucun compteur trouvé à supprimer.'
            }).catch(logger.error);

            return;
        }

        const counterToDelete = counters.find(c => c.id === counterId);

        if (!counterToDelete) {
            await replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: `Le compteur avec l'ID \`${counterId}\` est introuvable. Utilisez \`/serverstats list\` pour voir tous les compteurs.`
            }).catch(logger.error);

            return;
        }

        const channel = guild.channels.cache.get(counterToDelete.channelId);

        const embed = createEmbed({
            title: "Supprimer le compteur et le salon",
            description:
                `Êtes-vous sûr de vouloir supprimer ce compteur ainsi que son salon ?\n\n` +
                `**ID :** \`${counterToDelete.id}\`\n` +
                `**Type :** ${getCounterTypeDisplay(counterToDelete.type)}\n` +
                `**Salon :** ${channel || 'Salon supprimé'}\n\n` +
                `⚠️ **Le salon sera définitivement supprimé !**`,
            color: getColor('error')
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`counter-delete:confirm:${counterToDelete.id}:${interaction.user.id}`)
                .setLabel("Confirmer la suppression")
                .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()
                .setCustomId(`counter-delete:cancel:${counterToDelete.id}:${interaction.user.id}`)
                .setLabel("Annuler")
                .setStyle(ButtonStyle.Secondary)
        );

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed],
            components: [row]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Erreur dans handleDelete :", error);

        await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Une erreur est survenue lors de la récupération des compteurs. Veuillez réessayer.'
        }).catch(logger.error);
    }
}

export const performDeletionByCounterId = wrapServiceBoundary(
    async function performDeletionByCounterId(client, guild, counterId) {
        const counters = await getServerCounters(client, guild.id);

        const counter = counters.find(c => c.id === counterId);

        if (!counter) {
            throw createError(
                'Compteur introuvable',
                ErrorTypes.USER_INPUT,
                `Le compteur avec l'ID \`${counterId}\` est introuvable.`,
                {
                    guildId: guild.id,
                    counterId,
                    operation: 'performDeletionByCounterId'
                }
            );
        }

        const updatedCounters = counters.filter(c => c.id !== counter.id);

        const saved = await saveServerCounters(
            client,
            guild.id,
            updatedCounters
        );

        if (!saved) {
            throw createError(
                'Échec de la suppression du compteur',
                ErrorTypes.DATABASE,
                'Impossible de supprimer le compteur. Veuillez réessayer.',
                {
                    guildId: guild.id,
                    counterId,
                    operation: 'performDeletionByCounterId'
                }
            );
        }

        const channel = guild.channels.cache.get(counter.channelId);
        let channelDeleted = false;

        if (channel) {
            try {
                await channel.delete(
                    `Compteur supprimé - suppression du salon : ${counter.id}`
                );

                channelDeleted = true;
            } catch (error) {
                logger.error("Erreur lors de la suppression du salon :", error);
            }
        }

        let message =
            `✅ **Compteur supprimé avec succès !**\n\n` +
            `**ID :** \`${counter.id}\`\n` +
            `**Type :** ${getCounterTypeDisplay(counter.type)}`;

        if (channelDeleted) {
            message += `\n**Salon :** ${channel.name} (supprimé)`;
        } else if (channel) {
            message += `\n**Salon :** ${channel.name} (échec de la suppression)`;
        } else {
            message += `\n**Salon :** Déjà supprimé`;
        }

        return { message };
    },
    {
        service: 'serverstats',
        operation: 'performDeletionByCounterId',
        userMessage: 'Une erreur est survenue lors de la suppression du compteur. Veuillez réessayer.'
    }
);

function getCounterTypeDisplay(type) {
    return `${getCounterEmoji(type)} ${getCounterTypeLabel(type)}`;
}
```

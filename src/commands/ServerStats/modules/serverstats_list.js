```js
import { getColor } from '../../../config/bot.js';
import { PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import {
    getServerCounters,
    saveServerCounters,
    getCounterEmoji as getCounterTypeEmoji,
    getCounterTypeLabel,
    getGuildCounterStats
} from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

export async function handleList(interaction, client) {
    const guild = interaction.guild;

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Échec du report de la réponse :", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'Vous devez avoir la permission **Gérer les salons** pour consulter les compteurs.'
        }).catch(logger.error);

        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);
        const stats = await getGuildCounterStats(guild);

        const validCounters = [];
        const orphanedCounters = [];

        for (const counter of counters) {
            const channel = guild.channels.cache.get(counter.channelId);

            if (channel) {
                validCounters.push(counter);
            } else {
                orphanedCounters.push(counter);

                logger.info(
                    `Suppression du compteur orphelin ${counter.id} (type : ${counter.type}, salon supprimé : ${counter.channelId}) du serveur ${guild.id}`
                );
            }
        }

        if (orphanedCounters.length > 0) {
            await saveServerCounters(client, guild.id, validCounters);

            logger.info(
                `Nettoyage de ${orphanedCounters.length} compteur(s) orphelin(s) du serveur ${guild.id}`
            );
        }

        if (validCounters.length === 0) {
            const embed = createEmbed({
                title: "Compteurs du serveur",
                description:
                    "Aucun compteur n'a encore été configuré sur ce serveur.\n\n" +
                    "Utilisez `/serverstats create` pour configurer votre premier compteur !",
                color: getColor('warning')
            });

            embed.addFields({
                name: "**Types de compteurs disponibles**",
                value:
                    "**Membres + Bots** - Nombre total de membres du serveur\n" +
                    "**Membres uniquement** - Membres humains uniquement\n" +
                    "**Bots uniquement** - Membres bots uniquement",
                inline: false
            });

            embed.addFields({
                name: "**Exemples d'utilisation**",
                value:
                    "`/serverstats create type:members channel_type:voice category:Stats`\n" +
                    "`/serverstats create type:bots channel_type:text category:Server Info`\n" +
                    "`/serverstats list`",
                inline: false
            });

            embed.setFooter({
                text: "Système de compteurs • Mise à jour automatique toutes les 15 minutes"
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            }).catch(logger.error);

            return;
        }

        const embed = createEmbed({
            title: `Compteurs du serveur (${validCounters.length})`,
            description:
                "Voici tous les compteurs actifs de ce serveur.\n\n" +
                "Les compteurs sont automatiquement mis à jour toutes les 15 minutes.",
            color: getColor('info')
        });

        for (let i = 0; i < validCounters.length; i++) {
            const counter = validCounters[i];
            const channel = guild.channels.cache.get(counter.channelId);

            if (!channel) {
                logger.warn(
                    `Le compteur ${counter.id} possède toujours un salon introuvable après le nettoyage`
                );
                continue;
            }

            const currentCount = getCurrentCount(stats, counter.type);
            const status = channel.name.includes(':')
                ? '✅ Actif'
                : '⚠️ Non mis à jour';

            embed.addFields({
                name: `${getCounterTypeEmoji(counter.type)} Compteur #${i + 1} - ${channel.name}`,
                value:
                    `**ID :** \`${counter.id}\`\n` +
                    `**Type :** ${getCounterTypeDisplay(counter.type)}\n` +
                    `**Salon :** ${channel}\n` +
                    `**Nombre actuel :** ${currentCount}\n` +
                    `**Statut :** ${status}\n` +
                    `**Créé le :** ${new Date(counter.createdAt).toLocaleDateString()}`,
                inline: false
            });
        }

        embed.addFields({
            name: "**Statistiques**",
            value:
                `**Nombre total de compteurs :** ${validCounters.length}\n` +
                `**Compteurs actifs :** ${validCounters.filter(c => {
                    const channel = guild.channels.cache.get(c.channelId);
                    return channel && channel.name.includes(':');
                }).length}\n` +
                `**Prochaine mise à jour :** <t:${Math.floor(Date.now() / 1000) + 900}:R>`,
            inline: false
        });

        embed.addFields({
            name: "**Commandes de gestion**",
            value:
                "`/serverstats create` - Créer un nouveau compteur\n" +
                "`/serverstats update` - Modifier un compteur existant\n" +
                "`/serverstats delete` - Supprimer un compteur",
            inline: false
        });

        embed.setFooter({
            text: "Système de compteurs • Mise à jour automatique toutes les 15 minutes"
        });

        embed.setTimestamp();

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Erreur lors de l'affichage des compteurs :", error);

        await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Une erreur est survenue lors de la récupération des compteurs. Veuillez réessayer.'
        }).catch(logger.error);
    }
}

function getCounterTypeDisplay(type) {
    return `${getCounterTypeEmoji(type)} ${getCounterTypeLabel(type)}`;
}

function getCounterEmoji(type) {
    return getCounterTypeEmoji(type);
}

function getCurrentCount(stats, type) {
    switch (type) {
        case "members":
            return stats.totalCount;

        case "bots":
            return stats.botCount;

        case "members_only":
            return stats.humanCount;

        default:
            return 0;
    }
}
```

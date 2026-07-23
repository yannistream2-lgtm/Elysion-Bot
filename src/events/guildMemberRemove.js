import { Events, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getColor, botConfig } from '../config/bot.js';
import {
    getWelcomeConfig,
    getUserApplications,
    deleteApplication
} from '../utils/database.js';
import { formatWelcomeMessage } from '../utils/welcome.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import {
    getServerCounters,
    updateCounter
} from '../services/serverstatsService.js';
import {
    getGuildBirthdays,
    deleteBirthday
} from '../utils/database.js';
import { deleteUserLevelData } from '../services/leveling/leveling.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMemberRemove,
  once: false,
  
  async execute(member) {
    try {
        const {
            guild,
            user
        } = member;
        
        const welcomeConfig =
            await getWelcomeConfig(
                member.client,
                guild.id
            );
        
        const goodbyeChannelId =
            welcomeConfig?.goodbyeChannelId;

        if (
            welcomeConfig?.goodbyeEnabled &&
            goodbyeChannelId
        ) {
            const channel =
                guild.channels.cache.get(
                    goodbyeChannelId
                );

            if (channel?.isTextBased?.()) {
                const me = guild.members.me;

                const permissions =
                    me
                        ? channel.permissionsFor(me)
                        : null;

                if (
                    !permissions?.has([
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages
                    ])
                ) {
                    return;
                }

                const formatData = {
                    user,
                    guild,
                    member
                };

                const goodbyeMessage =
                    formatWelcomeMessage(
                        welcomeConfig.leaveMessage ||
                        welcomeConfig.leaveEmbed?.description ||
                        botConfig.welcome?.defaultGoodbyeMessage ||
                        '{user} a quitté le serveur.',
                        formatData
                    );

                const embedTitle =
                    formatWelcomeMessage(
                        welcomeConfig.leaveEmbed?.title ||
                        '👋 Au revoir',
                        formatData
                    );

                const embedFooter =
                    welcomeConfig.leaveEmbed?.footer
                        ? formatWelcomeMessage(
                            welcomeConfig.leaveEmbed.footer,
                            formatData
                        )
                        : `Au revoir de la part de ${guild.name} !`;

                const canEmbed =
                    permissions.has(
                        PermissionFlagsBits.EmbedLinks
                    );

                if (!canEmbed) {
                    await channel.send({
                        content:
                            welcomeConfig?.goodbyePing
                                ? `<@${user.id}> ${goodbyeMessage}`
                                : goodbyeMessage,

                        allowedMentions:
                            welcomeConfig?.goodbyePing
                                ? {
                                    users: [user.id]
                                }
                                : {
                                    parse: []
                                }
                    });
                } else {
                    const embed =
                        new EmbedBuilder()
                            .setTitle(embedTitle)
                            .setDescription(
                                goodbyeMessage
                            )
                            .setColor(
                                welcomeConfig.leaveEmbed?.color ||
                                getColor('error')
                            )
                            .setThumbnail(
                                user.displayAvatarURL()
                            )
                            .addFields(
                                {
                                    name: 'Utilisateur',
                                    value: `${user.tag} (${user.id})`,
                                    inline: true
                                },
                                {
                                    name: 'Nombre de membres',
                                    value: guild.memberCount.toString(),
                                    inline: true
                                }
                            )
                            .setTimestamp()
                            .setFooter({
                                text: embedFooter
                            });

                    if (
                        typeof welcomeConfig.leaveEmbed?.image ===
                        'string'
                    ) {
                        embed.setImage(
                            welcomeConfig.leaveEmbed.image
                        );
                    } else if (
                        welcomeConfig.leaveEmbed?.image?.url
                    ) {
                        embed.setImage(
                            welcomeConfig.leaveEmbed.image.url
                        );
                    }

                    await channel.send({
                        content:
                            welcomeConfig?.goodbyePing
                                ? `<@${user.id}>`
                                : undefined,

                        allowedMentions:
                            welcomeConfig?.goodbyePing
                                ? {
                                    users: [user.id]
                                }
                                : {
                                    parse: []
                                },

                        embeds: [embed]
                    });
                }
            }
        }

        // Enregistrement du départ du membre dans les logs.
        try {
            await logEvent({
                client: member.client,
                guildId: guild.id,
                eventType: EVENT_TYPES.MEMBER_LEAVE,
                data: {
                    title: 'Un utilisateur a quitté le serveur',
                    lines: [
                        `**Utilisateur :** ${user.toString()} (${user.tag})`,
                        `**ID :** \`${user.id}\``,
                        `**Arrivé :** <t:${Math.floor((member.joinedTimestamp || Date.now()) / 1000)}:R>`,
                        `**Membres :** ${guild.memberCount}`,
                    ],
                    quoted: false,
                    thumbnail: user.displayAvatarURL({
                        dynamic: true
                    }),
                    userId: user.id,
                }
            });
        } catch (error) {
            logger.debug(
                "Erreur lors de l'enregistrement du départ du membre :",
                error
            );
        }

        // Mise à jour des compteurs du serveur.
        try {
            const counters =
                await getServerCounters(
                    member.client,
                    guild.id
                );

            for (const counter of counters) {
                if (
                    counter &&
                    counter.type &&
                    counter.channelId &&
                    counter.enabled !== false
                ) {
                    await updateCounter(
                        member.client,
                        guild,
                        counter
                    );
                }
            }
        } catch (error) {
            logger.debug(
                "Erreur lors de la mise à jour des compteurs après le départ d'un membre :",
                error
            );
        }

        // Sauvegarder l'anniversaire du membre avant de le supprimer.
        try {
            const birthdays =
                await getGuildBirthdays(
                    member.client,
                    guild.id
                );

            if (birthdays[user.id]) {
                const backupKey =
                    `guild:${guild.id}:birthdays:left`;

                const backup =
                    (await member.client.db.get(
                        backupKey
                    )) || {};

                backup[user.id] =
                    birthdays[user.id];

                await member.client.db.set(
                    backupKey,
                    backup
                );

                await deleteBirthday(
                    member.client,
                    guild.id,
                    user.id
                );

                logger.debug(
                    `Anniversaire sauvegardé et supprimé pour l'utilisateur ${user.id} sur le serveur ${guild.id}`
                );
            }
        } catch (error) {
            logger.debug(
                "Erreur lors de la gestion de l'anniversaire après le départ du membre :",
                error
            );
        }

        // Supprimer les candidatures de l'utilisateur.
        try {
            const userApplications =
                await getUserApplications(
                    member.client,
                    guild.id,
                    user.id
                );

            if (
                userApplications &&
                userApplications.length > 0
            ) {
                for (
                    const app of userApplications
                ) {
                    await deleteApplication(
                        member.client,
                        guild.id,
                        app.id,
                        user.id
                    );
                }

                logger.debug(
                    `${userApplications.length} candidature(s) supprimée(s) pour l'utilisateur ${user.id} sur le serveur ${guild.id}`
                );
            }
        } catch (error) {
            logger.debug(
                "Erreur lors de la gestion des candidatures après le départ du membre :",
                error
            );
        }

        // Supprimer les données de niveau de l'utilisateur.
        try {
            await deleteUserLevelData(
                member.client,
                guild.id,
                user.id
            );

            logger.debug(
                `Données de niveau supprimées pour l'utilisateur ${user.id} sur le serveur ${guild.id}`
            );
        } catch (error) {
            logger.debug(
                "Erreur lors de la suppression des données de niveau après le départ du membre :",
                error
            );
        }
        
    } catch (error) {
        logger.error(
            "Erreur lors de l'événement de départ d'un membre :",
            error
        );
    }
  }
};

import { Events, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getColor, botConfig } from '../config/bot.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { getWelcomeConfig } from '../utils/database.js';
import { formatWelcomeMessage } from '../utils/welcome.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { getServerCounters, updateCounter } from '../services/serverstatsService.js';
import { setBirthday as dbSetBirthday } from '../utils/database.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMemberAdd,
  once: false,
  
  async execute(member) {
    try {
        const { guild, user } = member;
        
        const config = await getGuildConfig(member.client, guild.id);
        
        const welcomeConfig = await getWelcomeConfig(
            member.client,
            guild.id
        );
        
        const welcomeChannelId = welcomeConfig?.channelId;

        if (welcomeConfig?.enabled && welcomeChannelId) {
            const channel = guild.channels.cache.get(welcomeChannelId);
            const me = guild.members.me;

            const permissions =
                channel?.isTextBased?.() && me
                    ? channel.permissionsFor(me)
                    : null;

            // Ignorer uniquement le message de bienvenue si les permissions
            // sont insuffisantes. Le reste du processus d'arrivée
            // (rôle automatique, vérification, logs, compteurs) doit continuer.
            if (
                permissions?.has([
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages
                ])
            ) {
                const formatData = {
                    user,
                    guild,
                    member
                };

                const welcomeMessage = formatWelcomeMessage(
                    welcomeConfig.welcomeMessage ||
                    welcomeConfig.welcomeEmbed?.description ||
                    botConfig.welcome?.defaultWelcomeMessage ||
                    'Bienvenue {user} sur {server} !',
                    formatData
                );

                const messageContent =
                    welcomeConfig.welcomePing
                        ? user.toString()
                        : null;

                const embedTitle = formatWelcomeMessage(
                    welcomeConfig.welcomeEmbed?.title ||
                    '🎉 Bienvenue !',
                    formatData
                );

                const embedFooter =
                    welcomeConfig.welcomeEmbed?.footer
                        ? formatWelcomeMessage(
                            welcomeConfig.welcomeEmbed.footer,
                            formatData
                        )
                        : `Bienvenue sur ${guild.name} !`;

                const canEmbed = permissions.has(
                    PermissionFlagsBits.EmbedLinks
                );

                if (!canEmbed) {
                    await channel.send({
                        content: messageContent || welcomeMessage
                    });
                } else {
                    const embed = new EmbedBuilder()
                        .setColor(
                            welcomeConfig.welcomeEmbed?.color ||
                            getColor('success')
                        )
                        .setTitle(embedTitle)
                        .setDescription(welcomeMessage)
                        .setThumbnail(user.displayAvatarURL())
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
                    
                    if (welcomeConfig.welcomeImage) {
                        embed.setImage(
                            welcomeConfig.welcomeImage
                        );
                    } else if (
                        welcomeConfig.welcomeEmbed?.image?.url
                    ) {
                        embed.setImage(
                            welcomeConfig.welcomeEmbed.image.url
                        );
                    }
                    
                    await channel.send({
                        content: messageContent,
                        embeds: [embed]
                    });
                }
            }
        }
        
        // Attribution automatique des rôles.
        if (
            welcomeConfig?.roleIds &&
            welcomeConfig.roleIds.length > 0
        ) {
            const delay =
                welcomeConfig.autoRoleDelay || 0;

            const singleRoleId =
                welcomeConfig.roleIds[0];
            
            if (delay > 0) {
                const timeout = setTimeout(
                    async () => {
                        const role =
                            guild.roles.cache.get(
                                singleRoleId
                            );

                        if (role) {
                            await assignRoleSafely(
                                member,
                                role
                            );
                        }
                    },
                    delay * 1000
                );

                if (typeof timeout.unref === 'function') {
                    timeout.unref();
                }
            } else {
                const role =
                    guild.roles.cache.get(
                        singleRoleId
                    );

                if (role) {
                    await assignRoleSafely(
                        member,
                        role
                    );
                }
            }
        }
        
        // Gestion de la vérification automatique.
        if (
            config?.verification?.enabled ||
            config?.verification?.autoVerify?.enabled
        ) {
            await handleVerification(
                member,
                guild,
                config.verification,
                member.client
            );
        }

        // Enregistrement de l'arrivée du membre dans les logs.
        try {
            await logEvent({
                client: member.client,
                guildId: guild.id,
                eventType: EVENT_TYPES.MEMBER_JOIN,
                data: {
                    title: 'Un utilisateur a rejoint le serveur',
                    lines: [
                        `**Utilisateur :** ${user.toString()} (${user.displayName !== user.username ? `@${user.displayName}` : user.tag})`,
                        `**ID :** \`${user.id}\``,
                        `**Compte créé :** <t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
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
                "Erreur lors de l'enregistrement de l'arrivée du membre :",
                error
            );
        }

        // Mise à jour des compteurs du serveur.
        try {
            const counters = await getServerCounters(
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
                "Erreur lors de la mise à jour des compteurs après l'arrivée d'un membre :",
                error
            );
        }

        // Restaurer l'anniversaire d'un membre qui revient sur le serveur.
        try {
            const backupKey =
                `guild:${guild.id}:birthdays:left`;

            const backup =
                (await member.client.db.get(backupKey)) || {};

            if (backup[user.id]) {
                const {
                    month,
                    day
                } = backup[user.id];

                await dbSetBirthday(
                    member.client,
                    guild.id,
                    user.id,
                    month,
                    day
                );

                delete backup[user.id];

                await member.client.db.set(
                    backupKey,
                    backup
                );

                logger.debug(
                    `Anniversaire restauré pour l'utilisateur ${user.id} sur le serveur ${guild.id}`
                );
            }
        } catch (error) {
            logger.debug(
                "Erreur lors de la restauration de l'anniversaire après l'arrivée du membre :",
                error
            );
        }
        
    } catch (error) {
        logger.error(
            "Erreur lors de l'événement d'arrivée d'un membre :",
            error
        );
    }
  }
};

async function handleVerification(
    member,
    guild,
    verificationConfig,
    client
) {
    const {
        autoVerifyOnJoin
    } = await import(
        '../services/verificationService.js'
    );
    
    try {
        const result = await autoVerifyOnJoin(
            client,
            guild,
            member,
            verificationConfig
        );
        
        if (result.autoVerified) {
            logger.info(
                "Utilisateur vérifié automatiquement à son arrivée",
                {
                    guildId: guild.id,
                    userId: member.id,
                    userTag: member.user.tag,
                    roleName: result.roleName,
                    criteria: result.criteria
                }
            );
        } else {
            logger.debug(
                "Utilisateur non vérifié automatiquement à son arrivée",
                {
                    guildId: guild.id,
                    userId: member.id,
                    reason: result.reason
                }
            );
        }

    } catch (error) {
        logger.error(
            "Erreur lors de la vérification automatique du membre",
            {
                guildId: guild.id,
                userId: member.id,
                userTag: member.user.tag,
                error: error.message
            }
        );
    }
}

async function assignRoleSafely(
    member,
    role
) {
    try {
        await member.roles.add(role);
    } catch (error) {
        logger.warn(
            `Impossible d'attribuer le rôle ${role.id} au membre ${member.id} :`,
            error
        );
    }
}

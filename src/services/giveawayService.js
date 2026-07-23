// giveawayService.js

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../utils/errorHandler.js';
import { getColor, botConfig } from '../config/bot.js';
import { getEndedGiveaways, markGiveawayEnded } from '../utils/database.js';
import { checkRateLimit, getRateLimitStatus } from '../utils/rateLimiter.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';

const GIVEAWAY_CONFIG = botConfig.giveaways || {};
const GIVEAWAY_INTERACTION_COOLDOWN = 1000;

function getGiveawayInteractionKey(userId, giveawayId) {
    return `giveaway:${userId}:${giveawayId}`;
}

export function parseDuration(durationString) {
    if (!durationString || typeof durationString !== 'string') {
        throw new TitanBotError(
            'Format de durée invalide fourni',
            ErrorTypes.VALIDATION,
            'Veuillez fournir une durée valide (ex. : 1h, 30m, 5d, 10s).',
            { durationString }
        );
    }

    const regex = /^(\d+)([hmds])$/i;
    const match = durationString.trim().match(regex);

    if (!match) {
        throw new TitanBotError(
            `Format de durée invalide : ${durationString}`,
            ErrorTypes.VALIDATION,
            'Format de durée invalide. Utilisez : 1h, 30m, 5d, 10s (min. : 10s, max. : 30j).',
            { input: durationString }
        );
    }

    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    if (amount <= 0 || amount > 999) {
        throw new TitanBotError(
            `Valeur de durée hors limites : ${amount}`,
            ErrorTypes.VALIDATION,
            'La durée doit être comprise entre 1 et 999.',
            { amount, unit }
        );
    }

    let ms = 0;

    switch (unit) {
        case 's':
            ms = amount * 1000;
            break;

        case 'm':
            ms = amount * 60 * 1000;
            break;

        case 'h':
            ms = amount * 60 * 60 * 1000;
            break;

        case 'd':
            ms = amount * 24 * 60 * 60 * 1000;
            break;

        default:
            throw new TitanBotError(
                `Unité de durée inconnue : ${unit}`,
                ErrorTypes.VALIDATION,
                'Veuillez utiliser s (secondes), m (minutes), h (heures) ou d (jours).',
                { unit }
            );
    }

    const maxDuration = GIVEAWAY_CONFIG.maximumDuration ?? 30 * 24 * 60 * 60 * 1000;

    if (ms > maxDuration) {
        throw new TitanBotError(
            `La durée dépasse le maximum : ${ms}ms > ${maxDuration}ms`,
            ErrorTypes.VALIDATION,
            `La durée maximale est de ${Math.floor(maxDuration / (24 * 60 * 60 * 1000))} jours.`,
            { requestedMs: ms, maxMs: maxDuration }
        );
    }

    const minDuration = GIVEAWAY_CONFIG.minimumDuration ?? 10 * 1000;

    if (ms < minDuration) {
        throw new TitanBotError(
            `La durée est inférieure au minimum : ${ms}ms < ${minDuration}ms`,
            ErrorTypes.VALIDATION,
            `La durée minimale est de ${Math.ceil(minDuration / 1000)} secondes.`,
            { requestedMs: ms, minMs: minDuration }
        );
    }

    return ms;
}

export function validatePrize(prize) {
    if (!prize || typeof prize !== 'string') {
        throw new TitanBotError(
            'Le lot doit être une chaîne de caractères non vide',
            ErrorTypes.VALIDATION,
            'Veuillez fournir une description valide du lot.',
            { prize }
        );
    }

    const trimmed = prize.trim();

    if (trimmed.length === 0 || trimmed.length > 256) {
        throw new TitanBotError(
            `Longueur du lot hors limites : ${trimmed.length}`,
            ErrorTypes.VALIDATION,
            'Le lot doit contenir entre 1 et 256 caractères.',
            { length: trimmed.length }
        );
    }

    return trimmed;
}

export function validateWinnerCount(winnerCount) {
    const minimumWinners = GIVEAWAY_CONFIG.minimumWinners ?? 1;
    const maximumWinners = GIVEAWAY_CONFIG.maximumWinners ?? 10;

    if (
        !Number.isInteger(winnerCount) ||
        winnerCount < minimumWinners ||
        winnerCount > maximumWinners
    ) {
        throw new TitanBotError(
            `Nombre de gagnants invalide : ${winnerCount}`,
            ErrorTypes.VALIDATION,
            `Le nombre de gagnants doit être compris entre ${minimumWinners} et ${maximumWinners}.`,
            { winnerCount, minimumWinners, maximumWinners }
        );
    }
}

export function createGiveawayEmbed(giveaway, status, winners = []) {
    try {
        const statusEmoji =
            status === 'ended'
                ? '🎉'
                : status === 'reroll'
                    ? '🔄'
                    : '🎉';

        const isEnded = status === 'ended' || status === 'reroll';
        const color = isEnded
            ? getColor('giveaway.ended')
            : getColor('giveaway.active');

        const embed = new EmbedBuilder()
            .setTitle(`${statusEmoji} ${giveaway.prize}`)
            .setDescription('Cliquez sur le bouton ci-dessous pour participer !')
            .setColor(color)
            .addFields(
                {
                    name: '👤 Organisé par',
                    value: `<@${giveaway.hostId}>`,
                    inline: true
                },
                {
                    name: '🏆 Gagnants',
                    value: giveaway.winnerCount.toString(),
                    inline: true
                },
                {
                    name: '👥 Participants',
                    value: giveaway.participants?.length?.toString() || '0',
                    inline: true
                }
            );

        if (isEnded) {
            const winnerDisplay =
                winners.length > 0
                    ? winners.map(id => `<@${id}>`).join(', ')
                    : 'Aucune participation valide';

            embed.addFields({
                name: '🎯 Gagnants',
                value: winnerDisplay,
                inline: false
            });
        } else {
            const endTime = giveaway.endsAt || giveaway.endTime;

            embed.addFields({
                name: '⏰ Se termine',
                value: `<t:${Math.floor(endTime / 1000)}:R>`,
                inline: false
            });
        }

        embed.setTimestamp();

        return embed;
    } catch (error) {
        logger.error('Erreur lors de la création de l\'embed du giveaway :', error);

        throw new TitanBotError(
            'Échec de la création de l\'embed du giveaway',
            ErrorTypes.UNKNOWN,
            'Une erreur interne est survenue lors de la mise en forme du giveaway.',
            { error: error.message }
        );
    }
}

export function createGiveawayButtons(ended = false) {
    try {
        const row = new ActionRowBuilder();

        if (ended) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_reroll')
                    .setLabel('🎲 Nouveau tirage')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(false),

                new ButtonBuilder()
                    .setCustomId('giveaway_view')
                    .setLabel('👁️ Voir les gagnants')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false)
            );
        } else {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('giveaway_join')
                    .setLabel('🎉 Participer')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false),

                new ButtonBuilder()
                    .setCustomId('giveaway_end')
                    .setLabel('🛑 Terminer')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(false)
            );
        }

        return row;
    } catch (error) {
        logger.error('Erreur lors de la création des boutons du giveaway :', error);

        throw new TitanBotError(
            'Échec de la création des boutons du giveaway',
            ErrorTypes.UNKNOWN,
            'Une erreur interne est survenue lors de la création des boutons interactifs.',
            { error: error.message }
        );
    }
}

export function selectWinners(participants, winnerCount) {
    if (!Array.isArray(participants) || participants.length === 0) {
        return [];
    }

    const uniqueParticipants = [...new Set(participants)];

    if (!Number.isInteger(winnerCount) || winnerCount < 1) {
        throw new TitanBotError(
            'Nombre de gagnants invalide pour le tirage',
            ErrorTypes.VALIDATION,
            'Le nombre de gagnants doit être d\'au moins 1.',
            { winnerCount }
        );
    }

    const requested = Math.min(
        winnerCount,
        uniqueParticipants.length
    );

    try {
        const shuffled = [...uniqueParticipants];

        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        return shuffled.slice(0, requested);
    } catch (error) {
        logger.error('Erreur lors de la sélection des gagnants :', error);

        throw new TitanBotError(
            'Échec de la sélection des gagnants',
            ErrorTypes.UNKNOWN,
            'Une erreur est survenue lors de la sélection des gagnants.',
            {
                error: error.message,
                participantCount: participants.length
            }
        );
    }
}

export function isUserRateLimited(userId, giveawayId) {
    const status = getRateLimitStatus(
        getGiveawayInteractionKey(userId, giveawayId),
        GIVEAWAY_INTERACTION_COOLDOWN,
    );

    return status.attempts >= 1 && status.remaining > 0;
}

export async function recordUserInteraction(userId, giveawayId) {
    await checkRateLimit(
        getGiveawayInteractionKey(userId, giveawayId),
        1,
        GIVEAWAY_INTERACTION_COOLDOWN,
    );
}

export async function endGiveaway(client, giveaway, guildId, endedBy) {
    try {
        if (!giveaway) {
            throw new TitanBotError(
                'L\'objet giveaway est nul ou indéfini',
                ErrorTypes.VALIDATION,
                'Impossible de terminer un giveaway inexistant.',
                { giveaway }
            );
        }

        if (giveaway.ended === true || giveaway.isEnded === true) {
            throw new TitanBotError(
                `Le giveaway ${giveaway.messageId} est déjà terminé`,
                ErrorTypes.VALIDATION,
                'Ce giveaway est déjà terminé.',
                {
                    giveawayId: giveaway.messageId,
                    status: 'already_ended'
                }
            );
        }

        const participants = giveaway.participants || [];
        const winners = selectWinners(
            participants,
            giveaway.winnerCount || 1
        );

        const updatedGiveaway = {
            ...giveaway,
            ended: true,
            isEnded: true,
            winnerIds: winners,
            endedAt: new Date().toISOString(),
            endedBy: endedBy,
            participantCount: participants.length
        };

        logger.info(
            `Fin du giveaway ${giveaway.messageId} : ${winners.length} gagnant(s) sélectionné(s) parmi ${participants.length} participant(s)`
        );

        return {
            giveaway: updatedGiveaway,
            winners: winners,
            participantCount: participants.length
        };
    } catch (error) {
        if (error instanceof TitanBotError) {
            logger.debug(
                `Erreur de validation lors de la fin du giveaway : ${error.message}`,
                error.context || {}
            );

            throw error;
        }

        logger.error('Erreur lors de la fin du giveaway :', error);

        throw new TitanBotError(
            'Échec de la fin du giveaway',
            ErrorTypes.UNKNOWN,
            'Une erreur est survenue lors de la fin du giveaway.',
            {
                error: error.message,
                giveawayId: giveaway?.messageId
            }
        );
    }
}

export async function checkGiveaways(client) {
    try {
        if (!client.db) {
            logger.warn(
                'Base de données indisponible pour la vérification des giveaways'
            );
            return;
        }

        const endedGiveaways = await getEndedGiveaways(client);

        if (endedGiveaways.length === 0) {
            return;
        }

        logger.info(
            `Traitement de ${endedGiveaways.length} giveaway(s) terminé(s)`
        );

        for (const giveawayRecord of endedGiveaways) {
            try {
                const {
                    id: giveawayId,
                    guild_id: guildId,
                    message_id: messageId,
                    data: giveawayData
                } = giveawayRecord;

                const giveaway =
                    typeof giveawayData === 'string'
                        ? JSON.parse(giveawayData)
                        : giveawayData;

                const guild = client.guilds.cache.get(guildId);

                if (!guild) {
                    logger.debug(
                        `Serveur ${guildId} introuvable, giveaway ${messageId} ignoré`
                    );
                    continue;
                }

                const channel = await guild.channels
                    .fetch(giveaway.channelId)
                    .catch(() => null);

                if (!channel) {
                    logger.debug(
                        `Salon ${giveaway.channelId} introuvable pour le giveaway ${messageId}`
                    );
                    continue;
                }

                const message = await channel.messages
                    .fetch(messageId)
                    .catch(() => null);

                if (!message) {
                    logger.debug(
                        `Message ${messageId} introuvable dans le salon ${giveaway.channelId}`
                    );
                    continue;
                }

                const participants = giveaway.participants || [];

                const winners = selectWinners(
                    participants,
                    giveaway.winnerCount || 1
                );

                const winnerMentions =
                    winners.length > 0
                        ? winners.map(id => `<@${id}>`).join(', ')
                        : 'Aucune participation valide !';

                const endedEmbed = createGiveawayEmbed(
                    giveaway,
                    'ended',
                    winners
                );

                await message.edit({
                    embeds: [endedEmbed],
                    components: [createGiveawayButtons(true)]
                });

                giveaway.ended = true;
                giveaway.isEnded = true;
                giveaway.winnerIds = winners;
                giveaway.endedAt = new Date().toISOString();

                const markedSuccess = await markGiveawayEnded(
                    client,
                    giveawayId,
                    giveaway
                );

                if (!markedSuccess) {
                    logger.warn(
                        `Échec du marquage du giveaway ${messageId} comme terminé dans la base de données`
                    );
                }

                if (winners.length > 0) {
                    const winnerAnnouncement =
                        `🎉 Félicitations ${winnerMentions} ! Vous avez gagné le **${giveaway.prize || 'giveaway'}** ! Contactez <@${giveaway.hostId}> pour récupérer votre récompense.`;

                    const winnerPingMsg = await channel.send({
                        content: winnerAnnouncement
                    });

                    giveaway.winnerPingMessageId = winnerPingMsg.id;

                    await markGiveawayEnded(
                        client,
                        giveawayId,
                        giveaway
                    );

                    try {
                        await logEvent({
                            client,
                            guildId,
                            eventType: EVENT_TYPES.GIVEAWAY_WINNER,
                            data: {
                                description: `Le giveaway s'est terminé avec ${winners.length} gagnant(s)`,
                                channelId: channel.id,
                                fields: [
                                    {
                                        name: '🎁 Récompense',
                                        value:
                                            giveaway.prize ||
                                            'Récompense mystère !',
                                        inline: true
                                    },
                                    {
                                        name: '🏆 Gagnants',
                                        value: winners
                                            .map(id => `<@${id}>`)
                                            .join(', '),
                                        inline: false
                                    },
                                    {
                                        name: '👥 Participants',
                                        value: participants.length.toString(),
                                        inline: true
                                    }
                                ]
                            }
                        });
                    } catch (error) {
                        logger.debug(
                            'Erreur lors de l\'enregistrement du gagnant du giveaway :',
                            error
                        );
                    }
                } else {
                    await channel.send({
                        content: `Le giveaway pour **${giveaway.prize}** est terminé sans aucune participation valide.`
                    });
                }

                logger.info(
                    `Giveaway ${messageId} terminé sur le serveur ${guildId}`
                );
            } catch (error) {
                logger.error(
                    'Erreur lors du traitement du giveaway :',
                    error
                );
            }
        }
    } catch (error) {
        logger.error(
            'Erreur lors de la vérification des giveaways :',
            error
        );
    }
}

import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { TitanBotError, ErrorTypes, handleInteractionError, replyUserError } from '../utils/errorHandler.js';
import { 
    getGuildGiveaways, 
    saveGiveaway, 
    isGiveawayEnded 
} from '../utils/giveaways.js';
import { Mutex } from '../utils/mutex.js';
import { 
    selectWinners,
    isUserRateLimited,
    recordUserInteraction,
    createGiveawayEmbed,
    createGiveawayButtons
} from '../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';

export const giveawayJoinHandler = {
    customId: 'giveaway_join',
    async execute(interaction, client) {
        try {
            
            if (isUserRateLimited(interaction.user.id, interaction.message.id)) {
                return replyUserError(interaction, { 
                    type: ErrorTypes.RATE_LIMIT, 
                    message: 'Veuillez patienter un moment avant d’interagir à nouveau avec ce giveaway.' 
                });
            }

            await recordUserInteraction(interaction.user.id, interaction.message.id);

            const lockKey = `giveaway:${interaction.message.id}`;
            await Mutex.runExclusive(lockKey, async () => {
                const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
                const giveaway = guildGiveaways.find(g => g.messageId === interaction.message.id);

                if (!giveaway) {
                    throw new TitanBotError(
                        'Giveaway introuvable dans la base de données',
                        ErrorTypes.VALIDATION,
                        'Ce giveaway n’est plus actif.',
                        { messageId: interaction.message.id, guildId: interaction.guildId }
                    );
                }

                const endedByTime = isGiveawayEnded(giveaway);
                const endedByFlag = giveaway.ended || giveaway.isEnded;

                if (endedByTime || endedByFlag) {
                    return replyUserError(interaction, { 
                        type: ErrorTypes.UNKNOWN, 
                        message: 'Ce giveaway est déjà terminé.' 
                    });
                }

                const participants = giveaway.participants || [];
                const userId = interaction.user.id;

                if (participants.includes(userId)) {
                    return replyUserError(interaction, { 
                        type: ErrorTypes.UNKNOWN, 
                        message: 'Vous participez déjà à ce giveaway ! 🎉' 
                    });
                }

                participants.push(userId);
                giveaway.participants = participants;

                await saveGiveaway(client, interaction.guildId, giveaway);

                logger.debug(`L'utilisateur ${interaction.user.tag} a participé au giveaway ${interaction.message.id}`);

                const updatedEmbed = createGiveawayEmbed(giveaway, 'active');
                const updatedRow = createGiveawayButtons(false);

                await interaction.message.edit({
                    embeds: [updatedEmbed],
                    components: [updatedRow]
                });

                await interaction.reply({
                    embeds: [
                        successEmbed(
                            'Participation confirmée ! 🎉',
                            `Bonne chance ! Il y a maintenant ${participants.length} participant(s).`
                        )
                    ],
                    flags: MessageFlags.Ephemeral
                });
            });
        } catch (error) {
            logger.error('Erreur dans le gestionnaire de participation au giveaway :', error);
            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'giveaway_join',
                handler: 'giveaway'
            });
        }
    }
};

export const giveawayEndHandler = {
    customId: 'giveaway_end',
    async execute(interaction, client) {
        try {
            
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Bouton utilisé en dehors d’un serveur',
                    ErrorTypes.VALIDATION,
                    'Ce bouton peut uniquement être utilisé sur un serveur.',
                    { userId: interaction.user.id }
                );
            }

            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return replyUserError(interaction, { 
                    type: ErrorTypes.PERMISSION, 
                    message: 'Vous devez avoir la permission **Gérer le serveur** pour terminer un giveaway.' 
                });
            }

            const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
            const giveaway = guildGiveaways.find(g => g.messageId === interaction.message.id);

            if (!giveaway) {
                throw new TitanBotError(
                    'Giveaway introuvable dans la base de données',
                    ErrorTypes.VALIDATION,
                    'Ce giveaway n’est plus actif.',
                    { messageId: interaction.message.id, guildId: interaction.guildId }
                );
            }

            if (giveaway.ended || giveaway.isEnded || isGiveawayEnded(giveaway)) {
                throw new TitanBotError(
                    'Giveaway déjà terminé',
                    ErrorTypes.VALIDATION,
                    'Ce giveaway est déjà terminé.',
                    { messageId: interaction.message.id }
                );
            }

            const participants = giveaway.participants || [];
            const winners = selectWinners(participants, giveaway.winnerCount);

            giveaway.ended = true;
            giveaway.isEnded = true;
            giveaway.winnerIds = winners;
            giveaway.endedAt = new Date().toISOString();
            giveaway.endedBy = interaction.user.id;

            await saveGiveaway(client, interaction.guildId, giveaway);

            logger.info(`Giveaway terminé via le bouton par ${interaction.user.tag} : ${interaction.message.id}`);

            const updatedEmbed = createGiveawayEmbed(giveaway, 'ended', winners);
            const updatedRow = createGiveawayButtons(true);

            await interaction.message.edit({
                content: '🎉 **GIVEAWAY TERMINÉ** 🎉',
                embeds: [updatedEmbed],
                components: [updatedRow]
            });

            try {
                await logEvent({
                    client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_WINNER,
                    data: {
                        description: `Giveaway terminé avec ${winners.length} gagnant(s)`,
                        channelId: interaction.channelId,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: '🎁 Récompense',
                                value: giveaway.prize || 'Récompense mystère !',
                                inline: true
                            },
                            {
                                name: '🏆 Gagnant(s)',
                                value: winners.length > 0 
                                    ? winners.map(id => `<@${id}>`).join(', ')
                                    : 'Aucune participation valide',
                                inline: false
                            },
                            {
                                name: '👥 Nombre total de participants',
                                value: participants.length.toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Erreur lors de l’enregistrement de la fin du giveaway :', logError);
            }

            await interaction.reply({
                embeds: [
                    successEmbed(
                        `Giveaway terminé ✅`,
                        `Le giveaway est terminé et ${winners.length} gagnant(s) ont été sélectionné(s) !`
                    )
                ],
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            logger.error('Erreur lors de la fin du giveaway :', error);
            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'giveaway_end',
                handler: 'giveaway'
            });
        }
    }
};

export const giveawayRerollHandler = {
    customId: 'giveaway_reroll',
    async execute(interaction, client) {
        try {
            
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Bouton utilisé en dehors d’un serveur',
                    ErrorTypes.VALIDATION,
                    'Ce bouton peut uniquement être utilisé sur un serveur.',
                    { userId: interaction.user.id }
                );
            }

            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return replyUserError(interaction, { 
                    type: ErrorTypes.PERMISSION, 
                    message: 'Vous devez avoir la permission **Gérer le serveur** pour effectuer un nouveau tirage.' 
                });
            }

            const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
            const giveaway = guildGiveaways.find(g => g.messageId === interaction.message.id);

            if (!giveaway) {
                throw new TitanBotError(
                    'Giveaway introuvable dans la base de données',
                    ErrorTypes.VALIDATION,
                    'Ce giveaway n’est plus actif.',
                    { messageId: interaction.message.id, guildId: interaction.guildId }
                );
            }

            if (!giveaway.ended && !giveaway.isEnded) {
                throw new TitanBotError(
                    'Giveaway toujours actif',
                    ErrorTypes.VALIDATION,
                    'Ce giveaway n’est pas encore terminé. Veuillez d’abord le terminer.',
                    { messageId: interaction.message.id }
                );
            }

            const participants = giveaway.participants || [];
            
            if (participants.length === 0) {
                throw new TitanBotError(
                    'Aucun participant pour effectuer un nouveau tirage',
                    ErrorTypes.VALIDATION,
                    'Il n’y a aucun participant parmi lequel effectuer un nouveau tirage.',
                    { messageId: interaction.message.id }
                );
            }

            const newWinners = selectWinners(participants, giveaway.winnerCount);

            giveaway.winnerIds = newWinners;
            giveaway.rerolledAt = new Date().toISOString();
            giveaway.rerolledBy = interaction.user.id;

            await saveGiveaway(client, interaction.guildId, giveaway);

            logger.info(`Nouveau tirage effectué par ${interaction.user.tag} : ${interaction.message.id}`);

            const updatedEmbed = createGiveawayEmbed(giveaway, 'reroll', newWinners);
            const updatedRow = createGiveawayButtons(true);

            await interaction.message.edit({
                content: '🔄 **NOUVEAU TIRAGE EFFECTUÉ** 🔄',
                embeds: [updatedEmbed],
                components: [updatedRow]
            });

            try {
                await logEvent({
                    client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_REROLL,
                    data: {
                        description: `Nouveau tirage du giveaway effectué`,
                        channelId: interaction.channelId,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: '🎁 Récompense',
                                value: giveaway.prize || 'Récompense mystère !',
                                inline: true
                            },
                            {
                                name: '🏆 Nouveau(x) gagnant(s)',
                                value: newWinners.map(id => `<@${id}>`).join(', '),
                                inline: false
                            },
                            {
                                name: '👥 Nombre total de participants',
                                value: participants.length.toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Erreur lors de l’enregistrement du nouveau tirage :', logError);
            }

            await interaction.reply({
                embeds: [
                    successEmbed(
                        'Nouveau tirage effectué ✅',
                        `Un ou plusieurs nouveaux gagnants ont été sélectionnés !`
                    )
                ],
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            logger.error('Erreur lors du nouveau tirage du giveaway :', error);
            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'giveaway_reroll',
                handler: 'giveaway'
            });
        }
    }
};

export const giveawayViewHandler = {
    customId: 'giveaway_view',
    async execute(interaction, client) {
        try {
            if (!interaction.inGuild()) {
                throw new TitanBotError(
                    'Bouton utilisé en dehors d’un serveur',
                    ErrorTypes.VALIDATION,
                    'Ce bouton peut uniquement être utilisé sur un serveur.',
                    { userId: interaction.user.id }
                );
            }

            const guildGiveaways = await getGuildGiveaways(client, interaction.guildId);
            const giveaway = guildGiveaways.find(g => g.messageId === interaction.message.id);

            if (!giveaway) {
                throw new TitanBotError(
                    'Giveaway introuvable dans la base de données',
                    ErrorTypes.VALIDATION,
                    'Ce giveaway est introuvable.',
                    { messageId: interaction.message.id, guildId: interaction.guildId }
                );
            }

            if (!giveaway.ended && !giveaway.isEnded && !isGiveawayEnded(giveaway)) {
                return replyUserError(interaction, { 
                    type: ErrorTypes.UNKNOWN, 
                    message: 'Ce giveaway n’est pas encore terminé. Les gagnants ne sont donc pas encore disponibles.' 
                });
            }

            const winnerIds = Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds : [];
            const winnerMentions = winnerIds.length > 0
                ? winnerIds.map(id => `<@${id}>`).join(', ')
                : 'Aucun gagnant valide n’a été sélectionné pour ce giveaway.';

            await interaction.reply({
                embeds: [
                    successEmbed(
                        `Gagnant(s) de ${giveaway.prize || 'ce giveaway'} 🎉`,
                        winnerMentions
                    )
                ],
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            logger.error('Erreur lors de l’affichage des gagnants du giveaway :', error);
            await handleInteractionError(interaction, error, {
                type: 'button',
                customId: 'giveaway_view',
                handler: 'giveaway'
            });
        }
    }
};


import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildGiveaways, saveGiveaway } from '../../utils/giveaways.js';
import { 
    selectWinners,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("greroll")
        .setDescription("Effectue un nouveau tirage pour les gagnants d'un giveaway terminé.")
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("L'identifiant du message du giveaway terminé.")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        if (!interaction.inGuild()) {
            throw new TitanBotError(
                'Commande giveaway utilisée en dehors d\'un serveur',
                ErrorTypes.VALIDATION,
                'Cette commande peut uniquement être utilisée dans un serveur.',
                { userId: interaction.user.id }
            );
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            throw new TitanBotError(
                'L\'utilisateur ne possède pas la permission ManageGuild',
                ErrorTypes.PERMISSION,
                "Vous avez besoin de la permission « Gérer le serveur » pour effectuer un nouveau tirage.",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.info(`Nouveau tirage du giveaway lancé par ${interaction.user.tag} sur le serveur ${interaction.guildId}`);

        const messageId = interaction.options.getString("messageid");

        if (!messageId || !/^\d+$/.test(messageId)) {
            throw new TitanBotError(
                'Format d\'identifiant de message invalide',
                ErrorTypes.VALIDATION,
                'Veuillez fournir un identifiant de message valide.',
                { providedId: messageId }
            );
        }

        const giveaways = await getGuildGiveaways(
            interaction.client,
            interaction.guildId,
        );

        const giveaway = giveaways.find(g => g.messageId === messageId);

        if (!giveaway) {
            throw new TitanBotError(
                `Giveaway introuvable : ${messageId}`,
                ErrorTypes.VALIDATION,
                "Aucun giveaway n'a été trouvé avec cet identifiant de message dans la base de données.",
                { messageId, guildId: interaction.guildId }
            );
        }

        if (!giveaway.isEnded && !giveaway.ended) {
            throw new TitanBotError(
                `Giveaway toujours actif : ${messageId}`,
                ErrorTypes.VALIDATION,
                "Ce giveaway est toujours actif. Utilisez `/gend` pour le terminer d'abord.",
                { messageId, status: 'active' }
            );
        }

        const participants = giveaway.participants || [];

        if (participants.length < giveaway.winnerCount) {
            throw new TitanBotError(
                `Nombre de participants insuffisant pour le nouveau tirage : ${participants.length} < ${giveaway.winnerCount}`,
                ErrorTypes.VALIDATION,
                "Il n'y a pas assez de participations pour sélectionner le nombre de gagnants requis.",
                { participantsCount: participants.length, winnersNeeded: giveaway.winnerCount }
            );
        }

        const newWinners = selectWinners(
            participants,
            giveaway.winnerCount,
        );

        const updatedGiveaway = {
            ...giveaway,
            winnerIds: newWinners,
            rerolledAt: new Date().toISOString(),
            rerolledBy: interaction.user.id
        };

        const channel = await interaction.client.channels.fetch(
            giveaway.channelId,
        ).catch(err => {
            logger.warn(`Impossible de récupérer le salon ${giveaway.channelId} :`, err.message);
            return null;
        });

        if (!channel || !channel.isTextBased()) {

            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                updatedGiveaway,
            );

            logger.warn(`Impossible de trouver le salon du giveaway ${messageId}, mais les nouveaux gagnants ont été enregistrés dans la base de données`);

            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        "Nouveau tirage terminé",
                        "Les nouveaux gagnants ont été sélectionnés et enregistrés dans la base de données. Impossible de trouver le salon pour les annoncer.",
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }

        const message = await channel.messages
            .fetch(messageId)
            .catch(err => {
                logger.warn(`Impossible de récupérer le message ${messageId} :`, err.message);
                return null;
            });

        if (!message) {

            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                updatedGiveaway,
            );

            const winnerMentions = newWinners
                .map((id) => `<@${id}>`)
                .join(",");

            const existingPingMsg = giveaway.winnerPingMessageId
                ? await channel.messages.fetch(giveaway.winnerPingMessageId).catch(() => null)
                : null;

            if (existingPingMsg) {
                await existingPingMsg.edit({
                    content: `🔄 **NOUVEAU TIRAGE DU GIVEAWAY** 🔄 Les nouveaux gagnants de **${giveaway.prize}** sont : ${winnerMentions} !`,
                });
            } else {
                const newPingMsg = await channel.send({
                    content: `🔄 **NOUVEAU TIRAGE DU GIVEAWAY** 🔄 Les nouveaux gagnants de **${giveaway.prize}** sont : ${winnerMentions} !`,
                });
                updatedGiveaway.winnerPingMessageId = newPingMsg.id;
            }

            logger.info(`Nouveau tirage effectué (message introuvable, mais gagnants annoncés) : ${messageId}`);

            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_REROLL,
                    data: {
                        description: `Nouveau tirage du giveaway : ${giveaway.prize}`,
                        channelId: giveaway.channelId,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: 'Lot',
                                value: giveaway.prize || 'Lot mystère !',
                                inline: true
                            },
                            {
                                name: 'Nouveaux gagnants',
                                value: winnerMentions,
                                inline: false
                            },
                            {
                                name: 'Nombre total de participations',
                                value: participants.length.toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Erreur lors de l\'enregistrement du nouveau tirage du giveaway :', logError);
            }

            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        "Nouveau tirage terminé",
                        `Les nouveaux gagnants ont été annoncés dans ${channel}. (Le message original est introuvable).`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }

        await saveGiveaway(
            interaction.client,
            interaction.guildId,
            updatedGiveaway,
        );

        const newEmbed = createGiveawayEmbed(updatedGiveaway, "reroll", newWinners);
        const newRow = createGiveawayButtons(true);

        await message.edit({
            content: "🔄 **NOUVEAU TIRAGE DU GIVEAWAY** 🔄",
            embeds: [newEmbed],
            components: [newRow],
        });

        const winnerMentions = newWinners
            .map((id) => `<@${id}>`)
            .join(",");

        const existingPingMsg = giveaway.winnerPingMessageId
            ? await channel.messages.fetch(giveaway.winnerPingMessageId).catch(() => null)
            : null;

        if (existingPingMsg) {
            await existingPingMsg.edit({
                content: `🔄 **NOUVEAUX GAGNANTS** 🔄 FÉLICITATIONS ${winnerMentions} ! Vous êtes le(s) nouveau(x) gagnant(s) du giveaway **${giveaway.prize}** ! Contactez l'organisateur <@${giveaway.hostId}> pour récupérer votre lot.`,
            });
        } else {
            const newPingMsg = await channel.send({
                content: `🔄 **NOUVEAUX GAGNANTS** 🔄 FÉLICITATIONS ${winnerMentions} ! Vous êtes le(s) nouveau(x) gagnant(s) du giveaway **${giveaway.prize}** ! Contactez l'organisateur <@${giveaway.hostId}> pour récupérer votre lot.`,
            });
            updatedGiveaway.winnerPingMessageId = newPingMsg.id;
        }

        logger.info(`Giveaway relancé avec succès : ${messageId}, ${newWinners.length} nouveau(x) gagnant(s)`);

        try {
            await logEvent({
                client: interaction.client,
                guildId: interaction.guildId,
                eventType: EVENT_TYPES.GIVEAWAY_REROLL,
                data: {
                    description: `Nouveau tirage du giveaway : ${giveaway.prize}`,
                    channelId: giveaway.channelId,
                    userId: interaction.user.id,
                    fields: [
                        {
                            name: 'Lot',
                            value: giveaway.prize || 'Lot mystère !',
                            inline: true
                        },
                        {
                            name: 'Nouveaux gagnants',
                            value: winnerMentions,
                            inline: false
                        },
                        {
                            name: 'Nombre total de participations',
                            value: participants.length.toString(),
                            inline: true
                        }
                    ]
                }
            });
        } catch (logError) {
            logger.debug('Erreur lors de l\'enregistrement de l\'événement de nouveau tirage :', logError);
        }

        return InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    "Nouveau tirage réussi ✅",
                    `Le giveaway pour **${giveaway.prize}** dans ${channel} a été relancé avec succès. ${newWinners.length} nouveau(x) gagnant(s) ont été sélectionné(s).`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};
```

import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildGiveaways, saveGiveaway } from '../../utils/giveaways.js';
import { 
    endGiveaway as endGiveawayService,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("gend")
        .setDescription(
            "Termine immédiatement un giveaway actif et sélectionne le ou les gagnants.",
        )
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("L'identifiant du message du giveaway à terminer.")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        if (!interaction.inGuild()) {
            throw new TitanBotError(
                'Commande giveaway utilisée en dehors d’un serveur',
                ErrorTypes.VALIDATION,
                'Cette commande peut uniquement être utilisée dans un serveur.',
                { userId: interaction.user.id }
            );
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            throw new TitanBotError(
                'L’utilisateur ne possède pas la permission ManageGuild',
                ErrorTypes.PERMISSION,
                "Vous devez avoir la permission « Gérer le serveur » pour terminer un giveaway.",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.info(
            `Fin du giveaway lancée par ${interaction.user.tag} sur le serveur ${interaction.guildId}`
        );

        const messageId = interaction.options.getString("messageid");

        if (!messageId || !/^\d+$/.test(messageId)) {
            throw new TitanBotError(
                'Format d’identifiant de message invalide',
                ErrorTypes.VALIDATION,
                'Veuillez fournir un identifiant de message valide.',
                { providedId: messageId }
            );
        }

        const giveaways = await getGuildGiveaways(
            interaction.client,
            interaction.guildId
        );

        const giveaway = giveaways.find(
            g => g.messageId === messageId
        );

        if (!giveaway) {
            throw new TitanBotError(
                `Giveaway introuvable : ${messageId}`,
                ErrorTypes.VALIDATION,
                "Aucun giveaway n'a été trouvé avec cet identifiant de message dans la base de données.",
                { messageId, guildId: interaction.guildId }
            );
        }

        const endResult = await endGiveawayService(
            interaction.client,
            giveaway,
            interaction.guildId,
            interaction.user.id
        );

        const updatedGiveaway = endResult.giveaway;
        const winners = endResult.winners;

        const channel = await interaction.client.channels.fetch(
            updatedGiveaway.channelId,
        ).catch(err => {
            logger.warn(
                `Impossible de récupérer le salon ${updatedGiveaway.channelId} :`,
                err.message
            );
            return null;
        });

        if (!channel || !channel.isTextBased()) {
            throw new TitanBotError(
                `Salon introuvable : ${updatedGiveaway.channelId}`,
                ErrorTypes.VALIDATION,
                "Impossible de trouver le salon dans lequel le giveaway a été organisé. L'état du giveaway a été mis à jour.",
                {
                    channelId: updatedGiveaway.channelId,
                    messageId
                }
            );
        }

        const message = await channel.messages
            .fetch(messageId)
            .catch(err => {
                logger.warn(
                    `Impossible de récupérer le message ${messageId} :`,
                    err.message
                );
                return null;
            });

        if (!message) {
            throw new TitanBotError(
                `Message introuvable : ${messageId}`,
                ErrorTypes.VALIDATION,
                "Impossible de trouver le message du giveaway. L'état du giveaway a été mis à jour.",
                {
                    messageId,
                    channelId: updatedGiveaway.channelId
                }
            );
        }

        await saveGiveaway(
            interaction.client,
            interaction.guildId,
            updatedGiveaway,
        );

        const newEmbed = createGiveawayEmbed(
            updatedGiveaway,
            "ended",
            winners
        );

        const newRow = createGiveawayButtons(true);

        await message.edit({
            content: "🎉 **GIVEAWAY TERMINÉ** 🎉",
            embeds: [newEmbed],
            components: [newRow],
        });

        if (winners.length > 0) {
            const winnerMentions = winners
                .map((id) => `<@${id}>`)
                .join(",");

            const winnerPingMsg = await channel.send({
                content: `🎉 FÉLICITATIONS ${winnerMentions} ! Vous avez gagné le giveaway **${updatedGiveaway.prize}** ! Contactez l'organisateur <@${updatedGiveaway.hostId}> pour récupérer votre récompense.`,
            });

            updatedGiveaway.winnerPingMessageId = winnerPingMsg.id;

            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                updatedGiveaway
            );

            logger.info(
                `Giveaway terminé avec ${winners.length} gagnant(s) : ${messageId}`
            );

            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_WINNER,
                    data: {
                        description: `Giveaway terminé avec ${winners.length} gagnant(s)`,
                        channelId: channel.id,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: 'Récompense',
                                value: updatedGiveaway.prize || 'Récompense mystère !',
                                inline: true
                            },
                            {
                                name: 'Gagnants',
                                value: winnerMentions,
                                inline: false
                            },
                            {
                                name: 'Participations',
                                value: endResult.participantCount.toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug(
                    'Erreur lors de la journalisation de l’événement des gagnants du giveaway :',
                    logError
                );
            }
        } else {
            await channel.send({
                content: `Le giveaway pour **${updatedGiveaway.prize}** est terminé, mais aucune participation valide n'a été enregistrée.`,
            });

            logger.info(
                `Giveaway terminé sans gagnant : ${messageId}`
            );
        }

        logger.info(
            `Giveaway terminé avec succès par ${interaction.user.tag} : ${messageId}`
        );

        return InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    "Giveaway terminé ✅",
                    `Le giveaway pour **${updatedGiveaway.prize}** a été terminé avec succès dans ${channel}. **${winners.length} gagnant(s)** ont été sélectionné(s) parmi **${endResult.participantCount} participation(s)**.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};

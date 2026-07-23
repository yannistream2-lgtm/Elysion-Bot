import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildGiveaways, deleteGiveaway } from '../../utils/giveaways.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("gdelete")
        .setDescription(
            "Supprime un giveaway et le retire de la base de données.",
        )
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("L'identifiant du message du giveaway à supprimer.")
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
                "Vous devez avoir la permission « Gérer le serveur » pour supprimer un giveaway.",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.info(`Suppression du giveaway lancée par ${interaction.user.tag} sur le serveur ${interaction.guildId}`);

        const messageId = interaction.options.getString("messageid");

        if (!messageId || !/^\d+$/.test(messageId)) {
            throw new TitanBotError(
                'Format d’identifiant de message invalide',
                ErrorTypes.VALIDATION,
                'Veuillez fournir un identifiant de message valide.',
                { providedId: messageId }
            );
        }

        const giveaways = await getGuildGiveaways(interaction.client, interaction.guildId);
        const giveaway = giveaways.find(g => g.messageId === messageId);

        if (!giveaway) {
            throw new TitanBotError(
                `Giveaway introuvable : ${messageId}`,
                ErrorTypes.VALIDATION,
                "Aucun giveaway n'a été trouvé avec cet identifiant de message.",
                { messageId, guildId: interaction.guildId }
            );
        }

        let deletedMessage = false;
        let channelName = "Salon inconnu";

        const tryDeleteFromChannel = async (channel) => {
            if (!channel || !channel.isTextBased() || !channel.messages?.fetch) {
                return false;
            }

            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (!message) {
                return false;
            }

            await message.delete();
            channelName = channel.name || 'salon-inconnu';
            deletedMessage = true;
            return true;
        };

        try {
            const channel = await interaction.client.channels.fetch(giveaway.channelId).catch(() => null);

            if (await tryDeleteFromChannel(channel)) {
                logger.debug(`Message du giveaway ${messageId} supprimé du salon ${channelName}`);
            }

            if (!deletedMessage && interaction.guild) {
                const textChannels = interaction.guild.channels.cache.filter(
                    ch => ch.id !== giveaway.channelId && ch.isTextBased() && ch.messages?.fetch
                );

                for (const [, guildChannel] of textChannels) {
                    const foundAndDeleted = await tryDeleteFromChannel(guildChannel).catch(() => false);

                    if (foundAndDeleted) {
                        logger.debug(
                            `Message du giveaway ${messageId} supprimé via une recherche secondaire dans #${channelName}`
                        );
                        break;
                    }
                }
            }
        } catch (error) {
            logger.warn(`Impossible de supprimer le message du giveaway : ${error.message}`);
        }

        const removedFromDatabase = await deleteGiveaway(
            interaction.client,
            interaction.guildId,
            messageId,
        );

        if (!removedFromDatabase) {
            throw new TitanBotError(
                `Échec de la suppression du giveaway de la base de données : ${messageId}`,
                ErrorTypes.UNKNOWN,
                'Le giveaway n’a pas pu être supprimé de la base de données. Veuillez réessayer.',
                { messageId, guildId: interaction.guildId }
            );
        }

        const giveawaysAfterDelete = await getGuildGiveaways(
            interaction.client,
            interaction.guildId
        );

        const stillExistsInDatabase = giveawaysAfterDelete.some(
            g => g.messageId === messageId
        );

        if (stillExistsInDatabase) {
            throw new TitanBotError(
                `Le giveaway existe toujours après sa suppression : ${messageId}`,
                ErrorTypes.UNKNOWN,
                'La suppression n’a pas été enregistrée dans la base de données. Veuillez réessayer.',
                { messageId, guildId: interaction.guildId }
            );
        }

        const statusMsg = deletedMessage
            ? `et le message a été supprimé du salon #${channelName}`
            : `mais le message avait déjà été supprimé ou le salon était inaccessible.`;

        const winnerIds = Array.isArray(giveaway.winnerIds)
            ? giveaway.winnerIds
            : [];

        const hasWinners = winnerIds.length > 0;

        const wasEnded =
            giveaway.ended === true ||
            giveaway.isEnded === true ||
            hasWinners;

        const winnerStatusMsg = hasWinners
            ? `Ce giveaway avait déjà ${winnerIds.length} gagnant(s) sélectionné(s).`
            : wasEnded
                ? 'Ce giveaway était terminé sans gagnant valide.'
                : 'Aucun gagnant n’avait été sélectionné avant la suppression.';

        logger.info(
            `Giveaway supprimé : ${messageId} dans ${channelName}`
        );

        try {
            await logEvent({
                client: interaction.client,
                guildId: interaction.guildId,
                eventType: EVENT_TYPES.GIVEAWAY_DELETE,
                data: {
                    description: `Giveaway supprimé : ${giveaway.prize}`,
                    channelId: giveaway.channelId,
                    userId: interaction.user.id,
                    fields: [
                        {
                            name: 'Récompense',
                            value: giveaway.prize || 'Inconnue',
                            inline: true
                        },
                        {
                            name: 'Participations',
                            value: (giveaway.participants?.length || 0).toString(),
                            inline: true
                        }
                    ]
                }
            });
        } catch (logError) {
            logger.debug(
                'Erreur lors de la journalisation de la suppression du giveaway :',
                logError
            );
        }

        return InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    "Giveaway supprimé",
                    `Le giveaway pour **${giveaway.prize}** a été supprimé avec succès ${statusMsg}. ${winnerStatusMsg}`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};

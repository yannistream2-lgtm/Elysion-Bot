
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags
} from 'discord.js';

import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import {
    TitanBotError,
    ErrorTypes
} from '../../utils/errorHandler.js';

import { saveGiveaway } from '../../utils/giveaways.js';

import {
    parseDuration,
    validatePrize,
    validateWinnerCount,
    createGiveawayEmbed,
    createGiveawayButtons
} from '../../services/giveawayService.js';

import {
    logEvent,
    EVENT_TYPES
} from '../../services/loggingService.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

import { botConfig } from '../../config/bot.js';

const GIVEAWAY_MIN_WINNERS =
    botConfig.giveaways?.minimumWinners ?? 1;

const GIVEAWAY_MAX_WINNERS =
    botConfig.giveaways?.maximumWinners ?? 10;

export default {
    data: new SlashCommandBuilder()
        .setName("gcreate")
        .setDescription("Lance un nouveau concours dans un salon spécifié.")

        .addStringOption((option) =>
            option
                .setName("duration")
                .setDescription(
                    "Durée du concours (ex. 1h, 30m, 5d)."
                )
                .setRequired(true),
        )

        .addIntegerOption((option) =>
            option
                .setName("winners")
                .setDescription("Nombre de gagnants à sélectionner.")
                .setMinValue(GIVEAWAY_MIN_WINNERS)
                .setMaxValue(GIVEAWAY_MAX_WINNERS)
                .setRequired(true),
        )

        .addStringOption((option) =>
            option
                .setName("prize")
                .setDescription("Le lot à gagner.")
                .setRequired(true),
        )

        .addChannelOption((option) =>
            option
                .setName("channel")
                .setDescription(
                    "Le salon où envoyer le concours (le salon actuel par défaut)."
                )
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false),
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    async execute(interaction) {
        await InteractionHelper.safeDefer(
            interaction,
            { flags: MessageFlags.Ephemeral }
        );

        if (!interaction.inGuild()) {
            throw new TitanBotError(
                'Commande Giveaway utilisée en dehors d’un serveur',
                ErrorTypes.VALIDATION,
                'Cette commande peut uniquement être utilisée dans un serveur.',
                { userId: interaction.user.id }
            );
        }

        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageGuild
            )
        ) {
            throw new TitanBotError(
                'L’utilisateur ne possède pas la permission ManageGuild',
                ErrorTypes.PERMISSION,
                "Vous devez avoir la permission **Gérer le serveur** pour lancer un concours.",
                {
                    userId: interaction.user.id,
                    guildId: interaction.guildId
                }
            );
        }

        logger.info(
            `Création d'un concours lancée par ${interaction.user.tag} sur le serveur ${interaction.guildId}`
        );

        const durationString =
            interaction.options.getString("duration");

        const winnerCount =
            interaction.options.getInteger("winners");

        const prize =
            interaction.options.getString("prize");

        const targetChannel =
            interaction.options.getChannel("channel") ||
            interaction.channel;

        const durationMs =
            parseDuration(durationString);

        validateWinnerCount(winnerCount);

        const prizeName =
            validatePrize(prize);

        if (!targetChannel.isTextBased()) {
            throw new TitanBotError(
                'Le salon cible n’est pas basé sur du texte',
                ErrorTypes.VALIDATION,
                'Le salon doit être un salon textuel.',
                {
                    channelId: targetChannel.id,
                    channelType: targetChannel.type
                }
            );
        }

        const endTime =
            Date.now() + durationMs;

        const initialGiveawayData = {
            messageId: "placeholder",
            channelId: targetChannel.id,
            guildId: interaction.guildId,
            prize: prizeName,
            hostId: interaction.user.id,
            endTime: endTime,
            endsAt: endTime,
            winnerCount: winnerCount,
            participants: [],
            isEnded: false,
            ended: false,
            createdAt: new Date().toISOString()
        };

        const embed =
            createGiveawayEmbed(
                initialGiveawayData,
                "active"
            );

        const row =
            createGiveawayButtons(false);

        const giveawayMessage =
            await targetChannel.send({
                content: "🎉 **NOUVEAU CONCOURS** 🎉",
                embeds: [embed],
                components: [row],
            });

        initialGiveawayData.messageId =
            giveawayMessage.id;

        const saved =
            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                initialGiveawayData,
            );

        if (!saved) {
            logger.warn(
                `Échec de la sauvegarde du concours dans la base de données : ${giveawayMessage.id}`
            );
        }

        try {
            await logEvent({
                client: interaction.client,
                guildId: interaction.guildId,
                eventType: EVENT_TYPES.GIVEAWAY_CREATE,

                data: {
                    description:
                        `Concours créé : ${prizeName}`,

                    channelId:
                        targetChannel.id,

                    userId:
                        interaction.user.id,

                    fields: [
                        {
                            name: 'Lot',
                            value: prizeName,
                            inline: true
                        },
                        {
                            name: 'Gagnants',
                            value: winnerCount.toString(),
                            inline: true
                        },
                        {
                            name: 'Durée',
                            value: durationString,
                            inline: true
                        },
                        {
                            name: 'Salon',
                            value: targetChannel.toString(),
                            inline: true
                        }
                    ]
                }
            });

        } catch (logError) {
            logger.debug(
                'Erreur lors de l’enregistrement de la création du concours :',
                logError
            );
        }

        logger.info(
            `Concours créé avec succès : ${giveawayMessage.id} dans ${targetChannel.name}`
        );

        await InteractionHelper.safeReply(
            interaction,
            {
                embeds: [
                    successEmbed(
                        `Concours lancé ! 🎉`,
                        `Un nouveau concours pour **${prizeName}** a été lancé dans ${targetChannel} et se terminera dans **${durationString}**.`
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            }
        );
    },
};
```

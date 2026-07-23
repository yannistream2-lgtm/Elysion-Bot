import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderation/moderationService.js';

const durationChoices = [
    { name: "5 minutes", value: 5 },
    { name: "10 minutes", value: 10 },
    { name: "30 minutes", value: 30 },
    { name: "1 heure", value: 60 },
    { name: "6 heures", value: 360 },
    { name: "1 jour", value: 1440 },
    { name: "1 semaine", value: 10080 },
];

export default {
    data: new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("Mettre un utilisateur en timeout pendant une durée spécifique.")

        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("Utilisateur à mettre en timeout")
                .setRequired(true),
        )

        .addIntegerOption(
            (option) =>
                option
                    .setName("duration")
                    .setDescription("Durée du timeout")
                    .setRequired(true)
                    .addChoices(...durationChoices),
        )

        .addStringOption((option) =>
            option
                .setName("reason")
                .setDescription("Raison du timeout"),
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.ModerateMembers
        ),

    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn(
                `Échec du defer de l'interaction Timeout`,
                {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'timeout',
                }
            );

            return;
        }

        const targetUser =
            interaction.options.getUser("target");

        const member =
            interaction.options.getMember("target");

        const durationMinutes =
            interaction.options.getInteger("duration");

        const reason =
            interaction.options.getString("reason") ||
            "Aucune raison fournie";

        if (!targetUser) {
            throw new TitanBotError(
                'Utilisateur cible manquant',
                ErrorTypes.USER_INPUT,
                'Vous devez spécifier un utilisateur à mettre en timeout.',
                {
                    subtype: 'invalid_user'
                },
            );
        }

        if (targetUser.id === interaction.user.id) {
            throw new TitanBotError(
                "Impossible de se mettre soi-même en timeout",
                ErrorTypes.VALIDATION,
                "Vous ne pouvez pas vous mettre vous-même en timeout.",
            );
        }

        if (targetUser.id === client.user.id) {
            throw new TitanBotError(
                "Impossible de mettre le bot en timeout",
                ErrorTypes.VALIDATION,
                "Vous ne pouvez pas mettre le bot en timeout.",
            );
        }

        if (!member) {
            throw new TitanBotError(
                "Utilisateur introuvable",
                ErrorTypes.USER_INPUT,
                "L'utilisateur ciblé n'est actuellement pas présent sur ce serveur.",
            );
        }

        const durationMs =
            durationMinutes * 60 * 1000;

        const result =
            await ModerationService.timeoutUser({
                guild: interaction.guild,
                member,
                moderator: interaction.member,
                durationMs,
                reason,
            });

        const durationDisplay =
            durationChoices.find(
                (choice) =>
                    choice.value === durationMinutes
            )?.name ||
            `${durationMinutes} minutes`;

        await InteractionHelper.safeEditReply(
            interaction,
            {
                embeds: [
                    successEmbed(
                        `⏳ **Timeout** de ${targetUser.tag} pendant ${durationDisplay}.`,
                        `**Raison :** ${reason}\n**ID du cas :** #${result.caseId}`,
                    ),
                ],
            }
        );
    },
};

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("unban")
        .setDescription("Retirer le bannissement d'un utilisateur du serveur")

        .addStringOption(option =>
            option
                .setName("target")
                .setDescription("L'ID ou la mention de l'utilisateur à débannir")
                .setRequired(true),
        )

        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Raison du débannissement")
                .setRequired(false),
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.BanMembers
        ),

    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess =
            await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn(
                `Échec du defer de l'interaction Unban`,
                {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'unban',
                }
            );

            return;
        }

        const rawTarget =
            interaction.options.getString("target");

        const targetId =
            rawTarget
                .replace(/[<@!>]/g, '')
                .trim();

        if (!/^\d{17,20}$/.test(targetId)) {
            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: 'Veuillez fournir un ID utilisateur ou une mention valide.',
            });
        }

        const targetUser =
            await client.users
                .fetch(targetId)
                .catch(() => null);

        if (!targetUser) {
            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: `Impossible de trouver un utilisateur avec l'ID \`${targetId}\`.`,
            });
        }

        const reason =
            interaction.options.getString("reason") ||
            "Aucune raison fournie";

        const result =
            await ModerationService.unbanUser({
                guild: interaction.guild,
                user: targetUser,
                moderator: interaction.member,
                reason,
            });

        await InteractionHelper.safeEditReply(
            interaction,
            {
                embeds: [
                    successEmbed(
                        "✅ Utilisateur débanni",
                        `**${targetUser.tag}** a été débanni avec succès du serveur.\n\n**Raison :** ${reason}\n**ID du cas :** #${result.caseId}`,
                    ),
                ],
            }
        );
    },
};

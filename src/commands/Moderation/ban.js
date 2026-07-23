import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Bannir un utilisateur du serveur")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("L'utilisateur à bannir")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("reason")
                .setDescription("Raison du bannissement"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    category: "moderation",

    async execute(interaction, config, client) {
        const user = interaction.options.getUser("target");
        const reason =
            interaction.options.getString("reason") ||
            "Aucune raison fournie";

        if (!user) {
            throw new TitanBotError(
                'Utilisateur cible manquant',
                ErrorTypes.USER_INPUT,
                'Vous devez spécifier un utilisateur à bannir.',
                { subtype: 'invalid_user' },
            );
        }

        if (user.id === interaction.user.id) {
            throw new TitanBotError(
                'Impossible de se bannir soi-même',
                ErrorTypes.VALIDATION,
                'Vous ne pouvez pas vous bannir vous-même.',
            );
        }

        if (user.id === client.user.id) {
            throw new TitanBotError(
                'Impossible de bannir le bot',
                ErrorTypes.VALIDATION,
                'Vous ne pouvez pas bannir le bot.',
            );
        }

        const result = await ModerationService.banUser({
            guild: interaction.guild,
            user,
            moderator: interaction.member,
            reason,
        });

        await InteractionHelper.universalReply(interaction, {
            embeds: [
                successEmbed(
                    `🚫 **Banni** ${user.tag}`,
                    `**Raison :** ${reason}\n**ID du cas :** #${result.caseId}`,
                ),
            ],
        });
    },
};

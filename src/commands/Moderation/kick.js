
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Expulser un utilisateur du serveur")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("L'utilisateur à expulser")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("reason")
                .setDescription("La raison de l'expulsion"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    category: "moderation",

    async execute(interaction, config, client) {
        const targetUser = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");
        const reason = interaction.options.getString("reason") || "Aucune raison fournie";

        // Vérification de l'utilisateur ciblé
        if (!targetUser) {
            throw new TitanBotError(
                'Utilisateur cible manquant',
                ErrorTypes.USER_INPUT,
                'Vous devez spécifier un utilisateur à expulser.',
                { subtype: 'invalid_user' },
            );
        }

        // Empêcher l'utilisateur de s'expulser lui-même
        if (targetUser.id === interaction.user.id) {
            throw new TitanBotError(
                "Impossible de s'expulser soi-même",
                ErrorTypes.VALIDATION,
                "Vous ne pouvez pas vous expulser vous-même.",
            );
        }

        // Empêcher l'expulsion du bot
        if (targetUser.id === client.user.id) {
            throw new TitanBotError(
                "Impossible d'expulser le bot",
                ErrorTypes.VALIDATION,
                "Vous ne pouvez pas expulser le bot.",
            );
        }

        // Vérifier que l'utilisateur est présent sur le serveur
        if (!member) {
            throw new TitanBotError(
                "Utilisateur cible introuvable",
                ErrorTypes.USER_INPUT,
                "L'utilisateur ciblé n'est actuellement pas présent sur ce serveur.",
                { subtype: 'user_not_found' },
            );
        }

        // Exécuter l'expulsion
        const result = await ModerationService.kickUser({
            guild: interaction.guild,
            member,
            moderator: interaction.member,
            reason,
        });

        // Envoyer la confirmation
        await InteractionHelper.universalReply(interaction, {
            embeds: [
                successEmbed(
                    `👢 **Utilisateur expulsé** ${targetUser.tag}`,
                    `**Raison :** ${reason}\n**ID du dossier :** #${result.caseId}`,
                ),
            ],
        });
    },
};
```

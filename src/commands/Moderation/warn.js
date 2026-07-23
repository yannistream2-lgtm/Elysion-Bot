import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarningService } from '../../services/moderation/warningService.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';

export default {
    data: new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Avertir un utilisateur")
        .addUserOption((o) =>
            o
                .setName("target")
                .setRequired(true)
                .setDescription("Utilisateur à avertir"),
        )
        .addStringOption((o) =>
            o
                .setName("reason")
                .setRequired(true)
                .setDescription("Raison de l'avertissement"),
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ModerateMembers
        ),

    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess =
            await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn(
                `Échec du defer de l'interaction Warn`,
                {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'warn',
                }
            );
            return;
        }

        const target =
            interaction.options.getUser("target");

        const member =
            interaction.options.getMember("target");

        const reason =
            interaction.options.getString("reason");

        const moderator =
            interaction.user;

        const guildId =
            interaction.guildId;

        // Vérification de l'utilisateur ciblé
        if (!target) {
            throw new TitanBotError(
                'Utilisateur cible manquant',
                ErrorTypes.USER_INPUT,
                'Vous devez sélectionner un utilisateur à avertir.',
                {
                    subtype: 'invalid_user',
                },
            );
        }

        // Vérification de la raison
        if (!reason) {
            throw new TitanBotError(
                'Raison de l’avertissement manquante',
                ErrorTypes.VALIDATION,
                'Vous devez fournir une raison pour l’avertissement.',
                {
                    subtype: 'missing_required',
                },
            );
        }

        // Vérification de la présence sur le serveur
        if (!member) {
            throw new TitanBotError(
                "Utilisateur introuvable",
                ErrorTypes.USER_INPUT,
                "L'utilisateur ciblé n'est actuellement pas présent sur ce serveur.",
            );
        }

        // Vérification de la hiérarchie des rôles
        ModerationService.assertModerationHierarchy(
            interaction.member,
            member,
            'warn'
        );

        // Ajout de l'avertissement
        const {
            id,
            totalCount,
        } = await WarningService.addWarning({
            guildId,
            userId: target.id,
            moderatorId: moderator.id,
            reason,
            timestamp: Date.now(),
        });

        // Enregistrement dans les logs
        await logModerationAction({
            client,
            guild: interaction.guild,
            event: {
                action: "User Warned",

                target:
                    `${target.tag} (${target.id})`,

                executor:
                    `${moderator.tag} (${moderator.id})`,

                reason,

                metadata: {
                    userId: target.id,
                    moderatorId: moderator.id,
                    totalWarns: totalCount,
                    warningNumber: totalCount,
                    warningId: id,
                },
            },
        });

        // Réponse finale
        await InteractionHelper.safeEditReply(
            interaction,
            {
                embeds: [
                    successEmbed(
                        `⚠️ **Utilisateur averti** ${target.tag}`,

                        `**Raison :** ${reason}\n` +
                        `**Nombre total d'avertissements :** ${totalCount}`,
                    ),
                ],
            }
        );
    },
};

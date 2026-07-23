
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("massban")
        .setDescription("Bannir plusieurs utilisateurs du serveur en une seule fois")
        .addStringOption(option =>
            option
                .setName("users")
                .setDescription("IDs ou mentions des utilisateurs à bannir (séparés par des espaces ou des virgules)")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Raison du bannissement massif")
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option
                .setName("delete_days")
                .setDescription("Nombre de jours de messages à supprimer (0 à 7)")
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    category: "moderation",

    abuseProtection: {
        maxAttempts: 3,
        windowMs: 60_000
    },

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn(`Échec du report de l'interaction massban`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'massban'
            });
            return;
        }

        const usersInput = interaction.options.getString("users");
        const reason = interaction.options.getString("reason") || "Bannissement massif - Aucune raison fournie";
        const deleteDays = interaction.options.getInteger("delete_days") || 0;

        try {
            // Récupérer et nettoyer les IDs utilisateurs
            const userIds = usersInput
                .replace(/<@!?(\d+)>/g, '$1')
                .split(/[\s,]+/)
                .filter(id => id && /^\d+$/.test(id))
                .slice(0, 20);

            if (userIds.length === 0) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Veuillez fournir des IDs utilisateurs ou des mentions valides. Maximum 20 utilisateurs à la fois.'
                });
            }

            // Empêcher le bannissement de soi-même
            if (userIds.includes(interaction.user.id)) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Vous ne pouvez pas vous inclure dans un bannissement massif.'
                });
            }

            // Empêcher le bannissement du bot
            if (userIds.includes(client.user.id)) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Vous ne pouvez pas inclure le bot dans un bannissement massif.'
                });
            }

            const results = {
                successful: [],
                failed: [],
                skipped: []
            };

            // Traiter chaque utilisateur
            for (const userId of userIds) {
                try {
                    const user = await client.users.fetch(userId).catch(() => null);

                    if (!user) {
                        results.failed.push({
                            userId,
                            reason: "Utilisateur introuvable"
                        });
                        continue;
                    }

                    const member = await interaction.guild.members.fetch(userId).catch(() => null);

                    if (member) {
                        // Vérifier la hiérarchie entre le modérateur et la cible
                        const modCheck = ModerationService.validateHierarchy(
                            interaction.member,
                            member,
                            'ban'
                        );

                        if (!modCheck.valid) {
                            results.skipped.push({
                                user: user.tag,
                                userId,
                                reason: ModerationService.buildHierarchySkipReason(
                                    interaction.member,
                                    member,
                                    'ban'
                                ),
                            });
                            continue;
                        }

                        // Vérifier la hiérarchie entre le bot et la cible
                        const botCheck = ModerationService.validateBotHierarchy(member, 'ban');

                        if (!botCheck.valid) {
                            results.skipped.push({
                                user: user.tag,
                                userId,
                                reason: ModerationService.buildHierarchySkipReason(
                                    interaction.member,
                                    member,
                                    'ban',
                                    'bot'
                                ),
                            });
                            continue;
                        }
                    }

                    // Bannir l'utilisateur
                    await interaction.guild.members.ban(userId, {
                        reason: reason,
                        deleteMessageSeconds: deleteDays * 24 * 60 * 60
                    });

                    results.successful.push({
                        user: user.tag,
                        userId
                    });

                    // Enregistrer le bannissement dans les logs
                    await logModerationAction({
                        client,
                        guild: interaction.guild,
                        event: {
                            action: "Membre banni",
                            target: `${user.tag} (${user.id})`,
                            executor: `${interaction.user.tag} (${interaction.user.id})`,
                            reason: `${reason} (Bannissement massif)`,
                            metadata: {
                                userId: user.id,
                                moderatorId: interaction.user.id,
                                massBan: true,
                                permanent: true
                            }
                        }
                    });

                } catch (error) {
                    logger.error(`Échec du bannissement de l'utilisateur ${userId}:`, error);

                    const errorReason = error instanceof TitanBotError
                        ? (error.userMessage || error.message)
                        : (error.message || "Erreur inconnue");

                    results.failed.push({
                        userId,
                        reason: errorReason,
                    });
                }
            }

            // Construire le résultat final
            let description = `**Résultats du bannissement massif :**\n\n`;

            if (results.successful.length > 0) {
                description += `✅ **Bannissements réussis (${results.successful.length}) :**\n`;

                results.successful.forEach(result => {
                    description += `• ${result.user} (${result.userId})\n`;
                });

                description += '\n';
            }

            if (results.skipped.length > 0) {
                description += `⚠️ **Utilisateurs ignorés (${results.skipped.length}) :**\n`;

                results.skipped.forEach(result => {
                    description += `• ${result.user} - ${result.reason}\n`;
                });

                description += '\n';
            }

            if (results.failed.length > 0) {
                description += `❌ **Échecs (${results.failed.length}) :**\n`;

                results.failed.forEach(result => {
                    description += `• ${result.userId} - ${result.reason}\n`;
                });
            }

            const embed = results.successful.length > 0
                ? successEmbed
                : warningEmbed;

            // Afficher les résultats
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    embed(
                        `🔨 Bannissement massif terminé`,
                        description
                    )
                ]
            });

        } catch (error) {
            logger.error("Erreur dans la commande massban :", error);

            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Une erreur est survenue lors du traitement du bannissement massif. Veuillez réessayer plus tard.'
            });
        }
    }
};
```

import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("masskick")
        .setDescription("Expulser plusieurs utilisateurs du serveur en même temps")
        .addStringOption(option =>
            option
                .setName("users")
                .setDescription("IDs ou mentions des utilisateurs à expulser (séparés par des espaces ou des virgules)")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("reason")
                .setDescription("Raison de l'expulsion groupée")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    category: "moderation",

    abuseProtection: {
        maxAttempts: 3,
        windowMs: 60_000
    },

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn(`Échec du defer de l'interaction Masskick`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'masskick'
            });

            return;
        }

        const usersInput = interaction.options.getString("users");

        const reason =
            interaction.options.getString("reason") ||
            "Expulsion groupée - Aucune raison fournie";

        try {
            const userIds = usersInput
                .replace(/<@!?(\d+)>/g, '$1')
                .split(/[\s,]+/)
                .filter(id => id && /^\d+$/.test(id))
                .slice(0, 20);

            if (userIds.length === 0) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Veuillez fournir des IDs ou mentions d’utilisateurs valides. Maximum **20 utilisateurs** à la fois.'
                });
            }

            if (userIds.includes(interaction.user.id)) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Vous ne pouvez pas vous inclure vous-même dans une expulsion groupée.'
                });
            }

            if (userIds.includes(client.user.id)) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Vous ne pouvez pas inclure le bot dans une expulsion groupée.'
                });
            }

            const results = {
                successful: [],
                failed: [],
                skipped: []
            };

            for (const userId of userIds) {
                try {
                    const member = await interaction.guild.members
                        .fetch(userId)
                        .catch(() => null);

                    if (!member) {
                        results.failed.push({
                            userId,
                            reason: "L'utilisateur n'est pas présent sur le serveur"
                        });

                        continue;
                    }

                    const modCheck = ModerationService.validateHierarchy(
                        interaction.member,
                        member,
                        'kick'
                    );

                    if (!modCheck.valid) {
                        results.skipped.push({
                            user: member.user.tag,
                            userId,
                            reason: ModerationService.buildHierarchySkipReason(
                                interaction.member,
                                member,
                                'kick'
                            ),
                        });

                        continue;
                    }

                    const botCheck = ModerationService.validateBotHierarchy(
                        member,
                        'kick'
                    );

                    if (!botCheck.valid) {
                        results.skipped.push({
                            user: member.user.tag,
                            userId,
                            reason: ModerationService.buildHierarchySkipReason(
                                interaction.member,
                                member,
                                'kick',
                                'bot'
                            ),
                        });

                        continue;
                    }

                    if (!member.kickable) {
                        results.skipped.push({
                            user: member.user.tag,
                            userId,
                            reason: 'La cible possède le rôle Administrateur, un rôle géré, ou le bot ne possède pas la permission Expulser des membres'
                        });

                        continue;
                    }

                    await member.kick(reason);

                    results.successful.push({
                        user: member.user.tag,
                        userId
                    });

                    await logModerationAction({
                        client,
                        guild: interaction.guild,
                        event: {
                            action: "Membre expulsé",
                            target: `${member.user.tag} (${member.user.id})`,
                            executor: `${interaction.user.tag} (${interaction.user.id})`,
                            reason: `${reason} (Expulsion groupée)`,

                            metadata: {
                                userId: member.user.id,
                                moderatorId: interaction.user.id,
                                massKick: true
                            }
                        }
                    });

                } catch (error) {
                    logger.error(
                        `Échec de l'expulsion de l'utilisateur ${userId}:`,
                        error
                    );

                    const errorReason = error instanceof TitanBotError
                        ? (error.userMessage || error.message)
                        : (error.message || "Erreur inconnue");

                    results.failed.push({
                        userId,
                        reason: errorReason,
                    });
                }
            }

            let description = `**Résultats de l'expulsion groupée :**\n\n`;

            if (results.successful.length > 0) {
                description +=
                    `✅ **Expulsions réussies (${results.successful.length}) :**\n`;

                results.successful.forEach(result => {
                    description +=
                        `• ${result.user} (${result.userId})\n`;
                });

                description += '\n';
            }

            if (results.skipped.length > 0) {
                description +=
                    `⚠️ **Utilisateurs ignorés (${results.skipped.length}) :**\n`;

                results.skipped.forEach(result => {
                    description +=
                        `• ${result.user} - ${result.reason}\n`;
                });

                description += '\n';
            }

            if (results.failed.length > 0) {
                description +=
                    `❌ **Échecs (${results.failed.length}) :**\n`;

                results.failed.forEach(result => {
                    description +=
                        `• ${result.userId} - ${result.reason}\n`;
                });
            }

            const embed =
                results.successful.length > 0
                    ? successEmbed
                    : warningEmbed;

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    embed(
                        `👢 Expulsion groupée terminée`,
                        description
                    )
                ]
            });

        } catch (error) {
            logger.error(
                "Erreur lors de l'exécution de la commande masskick :",
                error
            );

            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: "Une erreur est survenue lors du traitement de l'expulsion groupée. Veuillez réessayer plus tard."
            });
        }
    }
};

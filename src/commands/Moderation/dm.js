import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { sanitizeMarkdown } from '../../utils/validation.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("dm")
        .setDescription("Envoyer un message privé à un utilisateur (réservé au staff)")
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("L'utilisateur à qui envoyer le message privé")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("Le message à envoyer")
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option
                .setName("anonymous")
                .setDescription("Envoyer le message anonymement (par défaut : non)")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),

    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn(`Échec du report de l'interaction DM`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'dm'
            });
            return;
        }

        const targetUser = interaction.options.getUser("user");
        const message = interaction.options.getString("message");
        const anonymous = interaction.options.getBoolean("anonymous") || false;

        try {
            // Vérification de la longueur du message
            if (message.length > 2000) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Les messages doivent contenir moins de 2000 caractères.'
                });
            }

            // Vérification si l'utilisateur est un bot
            if (targetUser.bot) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Vous ne pouvez pas envoyer de message privé aux comptes de bots.'
                });
            }

            // Nettoyage du Markdown
            const sanitized = sanitizeMarkdown(message);

            // Création du canal DM
            const dmChannel = await targetUser.createDM();

            // Envoi du message privé
            await dmChannel.send({
                embeds: [
                    successEmbed(
                        anonymous
                            ? "Message de l'équipe du staff"
                            : `Message de ${interaction.user.tag}`,
                        sanitized
                    ).setFooter({
                        text: `Vous ne pouvez pas répondre à ce message. | ID du journal : ${interaction.id}`
                    })
                ]
            });

            // Enregistrement de l'action dans les logs
            await logEvent({
                client: interaction.client,
                guild: interaction.guild,
                event: {
                    action: "Message privé envoyé",
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `Anonyme : ${anonymous ? 'Oui' : 'Non'}`,
                    metadata: {
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                        anonymous,
                        messageLength: sanitized.length
                    }
                }
            });

            // Confirmation pour le membre du staff
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "Message privé envoyé",
                        `Le message a été envoyé avec succès à ${targetUser.tag}.`
                    ),
                ],
            });

        } catch (error) {
            logger.error('Erreur de la commande DM :', error);

            // L'utilisateur a désactivé ses messages privés
            if (error.code === 50007) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: `Impossible d'envoyer un message privé à ${targetUser.tag}. Il est possible que ses messages privés soient désactivés.`
                });
            }

            // Autre erreur
            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: `Impossible d'envoyer le message privé : ${error.message}`
            });
        }
    }
};

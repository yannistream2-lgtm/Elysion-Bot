import { botConfig, getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed, infoEmbed, successEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { removeVerification, verifyUser } from '../../services/verificationService.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getWelcomeConfig } from '../../utils/database.js';
import verificationDashboard from './modules/verification_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName("verification")
        .setDescription("Gérer le système de vérification du serveur")
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("Configurer le système de vérification")
                .addChannelOption(option =>
                    option
                        .setName("verification_channel")
                        .setDescription("Salon où les messages de vérification seront envoyés")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName("verified_role")
                        .setDescription("Rôle à attribuer aux utilisateurs vérifiés")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("message")
                        .setDescription("Message de vérification personnalisé")
                        .setMaxLength(2000)
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName("button_text")
                        .setDescription("Texte du bouton de vérification")
                        .setMaxLength(80)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Retirer la vérification d'un utilisateur")
                .addUserOption(option =>
                    option
                        .setName("user")
                        .setDescription("Utilisateur dont vous souhaitez retirer la vérification")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("dashboard")
                .setDescription("Ouvrir le tableau de bord de configuration du système de vérification")
        ),

    async execute(interaction, config, client) {
        const wrappedExecute = withErrorHandling(async () => {
            const subcommand = interaction.options.getSubcommand();
            const guild = interaction.guild;

            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                throw createError(
                    'Permission ManageGuild manquante pour la sous-commande d’administration de la vérification',
                    ErrorTypes.PERMISSION,
                    'Vous avez besoin de la permission **Gérer le serveur** pour utiliser cette sous-commande de vérification.',
                    { subcommand, requiredPermission: 'ManageGuild', userId: interaction.user.id }
                );
            }

            switch (subcommand) {
                case "setup":
                    return await handleSetup(interaction, guild, client);
                case "remove":
                    return await handleRemove(interaction, guild, client);
                case "dashboard":
                    return await verificationDashboard.execute(interaction, config, client);
                default:
                    throw createError(
                        `Sous-commande inconnue : ${subcommand}`,
                        ErrorTypes.VALIDATION,
                        "Veuillez sélectionner une sous-commande valide.",
                        { subcommand }
                    );
            }
        }, { command: 'verification', subcommand: interaction.options.getSubcommand() });

        return await wrappedExecute(interaction, config, client);
    }
};

async function handleSetup(interaction, guild, client) {
    const verificationChannel = interaction.options.getChannel("verification_channel");
    const verifiedRole = interaction.options.getRole("verified_role");
    const message = interaction.options.getString("message") || botConfig.verification.defaultMessage;
    const buttonText = interaction.options.getString("button_text") || botConfig.verification.defaultButtonText;
    const botMember = guild.members.me;

    if (!botMember) {
        throw createError(
            'Membre du bot introuvable dans le cache du serveur',
            ErrorTypes.CONFIGURATION,
            'Je ne peux pas vérifier mes permissions sur ce serveur. Veuillez réessayer dans quelques instants.',
            { guildId: guild.id }
        );
    }

    const requiredChannelPermissions = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
    ];

    const missingChannelPerms = requiredChannelPermissions.filter(perm => 
        !verificationChannel.permissionsFor(botMember).has(perm)
    );
    
    if (missingChannelPerms.length > 0) {
        throw createError(
            `Permissions de salon manquantes : ${missingChannelPerms.join(', ')}`,
            ErrorTypes.PERMISSION,
            'J’ai besoin des permissions **Voir le salon**, **Envoyer des messages** et **Intégrer des liens** dans le salon de vérification.',
            { missingPermissions: missingChannelPerms, channel: verificationChannel.id }
        );
    }

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw createError(
            "Permission ManageRoles manquante",
            ErrorTypes.PERMISSION,
            "J’ai besoin de la permission **Gérer les rôles** pour attribuer les rôles de vérification.",
            { missingPermission: "ManageRoles" }
        );
    }

    if (verifiedRole.id === guild.id || verifiedRole.managed) {
        throw createError(
            'Rôle de vérification invalide',
            ErrorTypes.VALIDATION,
            'Veuillez choisir un rôle normal pouvant être attribué (pas @everyone ou un rôle géré par une intégration).',
            { roleId: verifiedRole.id, managed: verifiedRole.managed }
        );
    }

    const botRole = botMember.roles.highest;

    if (verifiedRole.position >= botRole.position) {
        throw createError(
            "Erreur de hiérarchie des rôles",
            ErrorTypes.PERMISSION,
            "Le rôle de vérification doit être placé en dessous de mon rôle le plus élevé dans la hiérarchie des rôles du serveur.",
            { rolePosition: verifiedRole.position, botRolePosition: botRole.position }
        );
    }

    const guildConfig = await getGuildConfig(client, guild.id);
    const welcomeConfig = await getWelcomeConfig(client, guild.id);
    const hasAutoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
    const hasAutoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);

    if (hasAutoVerifyEnabled || hasAutoRoleConfigured) {
        throw createError(
            'Configuration de la vérification bloquée par un système d’accueil incompatible',
            ErrorTypes.CONFIGURATION,
            'Vous ne pouvez pas activer le système de vérification tant que **AutoVerify** ou **AutoRole** est configuré. Désactivez d’abord ces systèmes.',
            {
                guildId: guild.id,
                hasAutoVerifyEnabled,
                hasAutoRoleConfigured,
                expected: true,
                suppressErrorLog: true
            }
        );
    }

    await InteractionHelper.safeDefer(interaction);

    const verifyEmbed = createEmbed({
        title: "Vérification du serveur",
        description: message,
        color: getColor('success')
    });

    const verifyButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("verify_user")
            .setLabel(buttonText)
            .setStyle(ButtonStyle.Success)
            .setEmoji("✅")
    );

    const verifyMessage = await verificationChannel.send({
        embeds: [verifyEmbed],
        components: [verifyButton]
    });

    guildConfig.verification = {
        enabled: true,
        channelId: verificationChannel.id,
        messageId: verifyMessage.id,
        roleId: verifiedRole.id,
        message: message,
        buttonText: buttonText
    };

    await setGuildConfig(client, guild.id, guildConfig);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
            'Système de vérification mis à jour',
            [
                `Salon : ${verificationChannel}`,
                `Rôle vérifié : ${verifiedRole}`,
                `Texte du bouton : ${buttonText}`
            ].join('\n')
        )]
    });
}

async function handleRemove(interaction, guild, client) {
    const targetUser = interaction.options.getUser("user");

    const result = await removeVerification(client, guild.id, targetUser.id, {
        moderatorId: interaction.user.id,
        reason: 'admin_removal'
    });

    if (result.status === 'not_verified') {
        return await InteractionHelper.safeReply(interaction, {
            embeds: [infoEmbed('Non vérifié', `${targetUser.tag} ne possède actuellement pas le rôle vérifié.`)],
            flags: MessageFlags.Ephemeral
        });
    }

    logger.info('Vérification retirée via la commande', {
        guildId: guild.id,
        targetUserId: targetUser.id,
        moderatorId: interaction.user.id
    });

    return await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('Vérification retirée', `La vérification de ${targetUser.tag} a été retirée.`)]
    });
}

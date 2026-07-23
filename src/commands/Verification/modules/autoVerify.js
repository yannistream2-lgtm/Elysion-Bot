import { botConfig, getColor } from '../../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../../utils/errorHandler.js';
import { validateAutoVerifyCriteria } from '../../../services/verificationService.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { getWelcomeConfig } from '../../../utils/database.js';
import autoVerifyDashboard from './autoVerifyDashboard.js';

const autoVerifyDefaults = botConfig.verification?.autoVerify || {};
const minAccountAgeDays = autoVerifyDefaults.minAccountAge ?? 1;
const maxAccountAgeDays = autoVerifyDefaults.maxAccountAge ?? 365;
const defaultAccountAgeDays = autoVerifyDefaults.defaultAccountAgeDays ?? 7;

export default {
    data: new SlashCommandBuilder()
        .setName("autoverify")
        .setDescription("Configurer les paramètres de vérification automatique")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("Configurer la vérification automatique")
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("Rôle à attribuer aux utilisateurs répondant aux critères de vérification automatique")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("criteria")
                        .setDescription("Critère pour la vérification automatique")
                        .addChoices(
                            { name: "Âge du compte", value: "account_age" },
                            { name: "Aucun critère", value: "none" }
                        )
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("account_age_days")
                        .setDescription("Âge minimum du compte en jours (requis pour le critère d'âge du compte)")
                        .setMinValue(minAccountAgeDays)
                        .setMaxValue(maxAccountAgeDays)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("dashboard")
                .setDescription("Ouvrir le tableau de bord de vérification automatique pour le personnaliser")
        ),

    async execute(interaction, config, client) {
        const wrappedExecute = withErrorHandling(async () => {
            const subcommand = interaction.options.getSubcommand();
            const guild = interaction.guild;

            switch (subcommand) {
                case "setup":
                    return await handleSetup(interaction, guild, client);
                case "dashboard":
                    return await autoVerifyDashboard.execute(interaction, config, client);
                default:
                    throw createError(
                        `Sous-commande inconnue : ${subcommand}`,
                        ErrorTypes.VALIDATION,
                        "Sous-commande invalide sélectionnée.",
                        { subcommand }
                    );
            }
        }, { command: 'autoverify', subcommand: interaction.options.getSubcommand() });

        return await wrappedExecute(interaction, config, client);
    }
};

async function handleSetup(interaction, guild, client) {
    const criteria = interaction.options.getString("criteria");
    const accountAgeDays = interaction.options.getInteger("account_age_days") || defaultAccountAgeDays;
    const targetRole = interaction.options.getRole("role");

    await InteractionHelper.safeDefer(interaction);

    try {
        const guildConfig = await getGuildConfig(client, guild.id);
        const welcomeConfig = await getWelcomeConfig(client, guild.id);
        const verificationEnabled = Boolean(guildConfig.verification?.enabled);
        const hasAutoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);

        if (verificationEnabled || hasAutoRoleConfigured) {
            throw createError(
                'Activation de la vérification automatique bloquée par un système d’accueil incompatible',
                ErrorTypes.CONFIGURATION,
                'Vous ne pouvez pas activer **AutoVerify** tant que le système de vérification ou **AutoRole** est configuré. Désactivez d’abord ces systèmes.',
                {
                    guildId: guild.id,
                    verificationEnabled,
                    hasAutoRoleConfigured,
                    expected: true,
                    suppressErrorLog: true
                }
            );
        }

        const botMember = guild.members.me;

        if (!botMember) {
            throw createError(
                'Membre du bot introuvable dans le cache du serveur',
                ErrorTypes.CONFIGURATION,
                'Je ne peux pas vérifier mes permissions sur ce serveur. Veuillez réessayer dans quelques instants.',
                { guildId: guild.id }
            );
        }

        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            throw createError(
                'Permission ManageRoles manquante',
                ErrorTypes.PERMISSION,
                "J’ai besoin de la permission **Gérer les rôles** pour attribuer les rôles de vérification automatique.",
                { guildId: guild.id }
            );
        }

        if (targetRole.id === guild.id || targetRole.managed) {
            throw createError(
                'Rôle de vérification automatique invalide',
                ErrorTypes.VALIDATION,
                'Veuillez choisir un rôle normal pouvant être attribué (pas @everyone ou un rôle géré par une intégration).',
                { guildId: guild.id, roleId: targetRole.id, managed: targetRole.managed }
            );
        }

        if (targetRole.position >= botMember.roles.highest.position) {
            throw createError(
                'Erreur de hiérarchie des rôles pour la configuration de la vérification automatique',
                ErrorTypes.PERMISSION,
                'Le rôle sélectionné pour la vérification automatique doit être placé en dessous de mon rôle le plus élevé dans la hiérarchie des rôles du serveur.',
                { guildId: guild.id, roleId: targetRole.id, rolePosition: targetRole.position, botRolePosition: botMember.roles.highest.position }
            );
        }

        validateAutoVerifyCriteria(criteria, criteria === 'account_age' ? accountAgeDays : 1);
        
        if (!guildConfig.verification) {
            guildConfig.verification = {};
        }

        guildConfig.verification.autoVerify = {
            enabled: true,
            criteria: criteria,
            accountAgeDays: criteria === "account_age" ? accountAgeDays : null,
            roleId: targetRole.id,
            configuredVia: 'setup'
        };

        await setGuildConfig(client, guild.id, guildConfig);

        let criteriaDescription = "";

        switch (criteria) {
            case "account_age":
                criteriaDescription = `\`${accountAgeDays} jours\` minimum`;
                break;
            case "none":
                criteriaDescription = "Tous les utilisateurs immédiatement";
                break;
        }

        logger.info('Vérification automatique activée', {
            guildId: guild.id,
            criteria,
            accountAgeDays: criteria === 'account_age' ? accountAgeDays : null,
            roleId: targetRole.id
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
                "Vérification automatique configurée",
                `La vérification automatique a été configurée !\n\n**Rôle :** ${targetRole}\n**Critère :** ${criteriaDescription}\n\nLes utilisateurs qui répondent à ces critères recevront ce rôle lorsqu’ils rejoindront le serveur.`
            )]
        });

    } catch (error) {
        throw error;
    }
}

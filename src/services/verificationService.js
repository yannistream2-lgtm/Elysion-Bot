// verificationService.js

import { PermissionFlagsBits } from 'discord.js';
import { botConfig } from '../config/bot.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig, setGuildConfig } from './config/guildConfig.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { insertVerificationAudit } from '../utils/database.js';
import { ensureTypedServiceError } from '../utils/serviceErrorBoundary.js';

const verificationCooldowns = new Map();
const attemptTracker = new Map();

const verificationDefaults = botConfig?.verification || {};
const autoVerifyDefaults = verificationDefaults.autoVerify || {};
const minAutoVerifyAccountAgeDays = autoVerifyDefaults.minAccountAge ?? 1;
const maxAutoVerifyAccountAgeDays = autoVerifyDefaults.maxAccountAge ?? 365;
const serverSizeThreshold = autoVerifyDefaults.serverSizeThreshold ?? 1000;
const defaultCooldownMs = verificationDefaults.verificationCooldown ?? 5000;
const defaultMaxAttempts = verificationDefaults.maxVerificationAttempts ?? 3;
const defaultAttemptWindowMs = verificationDefaults.attemptWindow ?? 60000;
const maxCooldownEntries = verificationDefaults.maxCooldownEntries ?? 10000;
const maxAttemptEntries = verificationDefaults.maxAttemptEntries ?? 10000;
const cooldownCleanupIntervalMs = verificationDefaults.cooldownCleanupInterval ?? 300000;
const maxAuditMetadataBytes = verificationDefaults.maxAuditMetadataBytes ?? 4096;
const shouldSendAutoVerifyDm = autoVerifyDefaults.sendDMNotification ?? true;
const shouldLogVerifications = verificationDefaults.logAllVerifications ?? true;
const shouldKeepAuditTrail = verificationDefaults.keepAuditTrail ?? false;
let lastCleanupAt = 0;

export async function verifyUser(client, guildId, userId, options = {}) {
    const { source = 'manual', moderatorId = null } = options;
    
    try {
        
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw createError(
                `Guild ${guildId} not found`,
                ErrorTypes.CONFIGURATION,
                "Serveur introuvable dans le cache du bot.",
                { guildId }
            );
        }

        let member;
        try {
            member = await guild.members.fetch(userId);
        } catch (error) {
            throw createError(
                `Member ${userId} not found in guild`,
                ErrorTypes.USER_INPUT,
                "Cet utilisateur ne se trouve pas sur ce serveur.",
                { userId, guildId }
            );
        }

        const guildConfig = await getGuildConfig(client, guildId);
        
        if (!guildConfig.verification?.enabled) {
            throw createError(
                "Verification system disabled",
                ErrorTypes.CONFIGURATION,
                "Le système de vérification n'est pas activé sur ce serveur.",
                { guildId }
            );
        }

        await validateVerificationSetup(guild, guildConfig.verification);

        const verifiedRole = guild.roles.cache.get(guildConfig.verification.roleId);
        const canAssignRole = await validateBotCanAssignRole(guild, verifiedRole.id);
        if (!canAssignRole) {
            throw createError(
                'Bot cannot assign verified role',
                ErrorTypes.PERMISSION,
                "Je ne peux pas attribuer le rôle de vérification. Vérifiez que j'ai la permission **Gérer les rôles** et que ma position dans la hiérarchie des rôles est correcte.",
                { guildId, roleId: verifiedRole.id }
            );
        }

        if (member.roles.cache.has(verifiedRole.id)) {
            return {
                status: 'already_verified',
                userId,
                roleId: verifiedRole.id,
                roleName: verifiedRole.name,
            };
        }

        await checkVerificationCooldown(userId, guildId, defaultCooldownMs);
        await trackVerificationAttempt(userId, guildId, defaultMaxAttempts, defaultAttemptWindowMs);

        await member.roles.add(verifiedRole.id, `Utilisateur vérifié (${source})`);

        logVerificationAction(client, guildId, userId, 'verified', {
            source,
            roleId: verifiedRole.id,
            roleName: verifiedRole.name,
            moderatorId
        });

        logger.info('User verified successfully', {
            guildId,
            userId,
            roleId: verifiedRole.id,
            source,
            moderatorId
        });

        return {
            status: 'verified',
            userId,
            roleId: verifiedRole.id,
            roleName: verifiedRole.name,
        };

    } catch (error) {
        const typedError = ensureTypedServiceError(error, {
            service: 'verificationService',
            operation: 'verifyUser',
            type: ErrorTypes.UNKNOWN,
            message: 'Verification operation failed: verifyUser',
            userMessage: 'La vérification a échoué. Veuillez réessayer dans un instant.',
            context: { guildId, userId, source: options.source }
        });
        logger.error('Error verifying user', {
            guildId,
            userId,
            source: options.source,
            error: typedError.message,
            errorCode: typedError.context?.errorCode
        });
        throw typedError;
    }
}

function pruneVerificationTrackers(now = Date.now()) {
    if (now - lastCleanupAt < cooldownCleanupIntervalMs) {
        return;
    }

    lastCleanupAt = now;

    for (const [key, timestamp] of verificationCooldowns.entries()) {
        if (now - timestamp > Math.max(defaultCooldownMs * 2, 60000)) {
            verificationCooldowns.delete(key);
        }
    }

    for (const [key, attempts] of attemptTracker.entries()) {
        const recentAttempts = (attempts || []).filter(ts => now - ts < defaultAttemptWindowMs);
        if (recentAttempts.length === 0) {
            attemptTracker.delete(key);
            continue;
        }
        attemptTracker.set(key, recentAttempts);
    }

    while (verificationCooldowns.size > maxCooldownEntries) {
        const firstKey = verificationCooldowns.keys().next().value;
        if (!firstKey) {
            break;
        }
        verificationCooldowns.delete(firstKey);
    }

    while (attemptTracker.size > maxAttemptEntries) {
        const firstKey = attemptTracker.keys().next().value;
        if (!firstKey) {
            break;
        }
        attemptTracker.delete(firstKey);
    }
}

export async function autoVerifyOnJoin(client, guild, member, verificationConfig) {
    try {
        
        if (!verificationConfig.autoVerify?.enabled) {
            return {
                autoVerified: false,
                reason: 'auto_verify_disabled'
            };
        }

        const autoVerifyRoleId = verificationConfig.autoVerify?.roleId || verificationConfig.roleId;
        if (!autoVerifyRoleId) {
            return {
                autoVerified: false,
                reason: 'auto_verify_role_not_configured'
            };
        }

        const effectiveVerificationConfig = {
            ...verificationConfig,
            roleId: autoVerifyRoleId
        };

        await validateVerificationSetup(guild, effectiveVerificationConfig);

        const shouldVerify = evaluateAutoVerifyCriteria(
            member,
            verificationConfig.autoVerify
        );

        if (!shouldVerify) {
            return {
                autoVerified: false,
                reason: 'criteria_not_met',
                criteria: verificationConfig.autoVerify.criteria
            };
        }

        const verifiedRole = guild.roles.cache.get(autoVerifyRoleId);

        const canAssign = await validateBotCanAssignRole(guild, verifiedRole.id);
        if (!canAssign) {
            logger.warn('Cannot auto-verify: bot cannot assign role', {
                guildId: guild.id,
                userId: member.id,
                roleId: verifiedRole.id
            });
            return {
                autoVerified: false,
                reason: 'bot_cannot_assign_role'
            };
        }

        if (member.roles.cache.has(verifiedRole.id)) {
            return {
                autoVerified: false,
                reason: 'already_verified',
                alreadyHasRole: true
            };
        }

        await member.roles.add(verifiedRole.id, 'Vérification automatique à l’arrivée');

        logVerificationAction(client, guild.id, member.id, 'auto_verified', {
            criteria: verificationConfig.autoVerify.criteria,
            accountAge: Date.now() - member.user.createdTimestamp,
            roleId: verifiedRole.id,
            roleName: verifiedRole.name
        });

        logger.info('User auto-verified on join', {
            guildId: guild.id,
            userId: member.user.id,
            userTag: member.user.tag,
            criteria: verificationConfig.autoVerify.criteria,
            accountAge: Date.now() - member.user.createdTimestamp
        });

        if (shouldSendAutoVerifyDm) {
            await sendAutoVerifyNotification(member, verifiedRole, guild);
        }

        return {
            autoVerified: true,
            userId: member.id,
            roleId: verifiedRole.id,
            roleName: verifiedRole.name,
            criteria: verificationConfig.autoVerify.criteria
        };

    } catch (error) {
        const typedError = ensureTypedServiceError(error, {
            service: 'verificationService',
            operation: 'autoVerifyOnJoin',
            type: ErrorTypes.UNKNOWN,
            message: 'Verification operation failed: autoVerifyOnJoin',
            userMessage: 'La vérification automatique a échoué. Veuillez effectuer la vérification manuellement.',
            context: { guildId: guild.id, userId: member.id }
        });
        logger.error('Error in auto-verification on join', {
            guildId: guild.id,
            userId: member.id,
            error: typedError.message,
            errorCode: typedError.context?.errorCode
        });
        
        return {
            autoVerified: false,
            reason: 'auto_verify_error',
            error: typedError.userMessage || typedError.message,
            errorCode: typedError.context?.errorCode
        };
    }
}

export async function removeVerification(client, guildId, userId, options = {}) {
    const { moderatorId = null, reason = 'admin_removal' } = options;
    
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw createError(
                `Guild ${guildId} not found`,
                ErrorTypes.CONFIGURATION,
                "Serveur introuvable.",
                { guildId }
            );
        }

        let member;
        try {
            member = await guild.members.fetch(userId);
        } catch (error) {
            throw createError(
                `Member ${userId} not found`,
                ErrorTypes.USER_INPUT,
                "Cet utilisateur ne se trouve pas sur ce serveur.",
                { userId }
            );
        }

        const guildConfig = await getGuildConfig(client, guildId);
        
        if (!guildConfig.verification?.enabled) {
            throw createError(
                "Verification system disabled",
                ErrorTypes.CONFIGURATION,
                "Le système de vérification n'est pas activé.",
                { guildId }
            );
        }

        const verifiedRole = guild.roles.cache.get(guildConfig.verification.roleId);
        if (!verifiedRole) {
            throw createError(
                "Verified role not found",
                ErrorTypes.CONFIGURATION,
                "Le rôle de vérification n'existe plus.",
                { roleId: guildConfig.verification.roleId }
            );
        }

        const canAssignRole = await validateBotCanAssignRole(guild, verifiedRole.id);
        if (!canAssignRole) {
            throw createError(
                'Bot cannot manage verified role',
                ErrorTypes.PERMISSION,
                "Je ne peux pas retirer le rôle de vérification. Vérifiez que j'ai la permission **Gérer les rôles** et que ma position dans la hiérarchie des rôles est correcte.",
                { guildId, roleId: verifiedRole.id }
            );
        }

        if (!member.roles.cache.has(verifiedRole.id)) {
            return {
                status: 'not_verified',
                userId,
            };
        }

        await member.roles.remove(
            verifiedRole.id, 
            `Vérification retirée par ${moderatorId || 'le système'} : ${reason}`
        );

        logVerificationAction(client, guildId, userId, 'removed', {
            removedBy: moderatorId,
            reason,
            roleId: verifiedRole.id,
            roleName: verifiedRole.name
        });

        logger.info('Verification removed from user', {
            guildId,
            userId,
            removedBy: moderatorId,
            reason
        });

        return {
            status: 'removed',
            userId,
            roleId: verifiedRole.id,
        };

    } catch (error) {
        const typedError = ensureTypedServiceError(error, {
            service: 'verificationService',
            operation: 'removeVerification',
            type: ErrorTypes.UNKNOWN,
            message: 'Verification operation failed: removeVerification',
            userMessage: 'Impossible de retirer la vérification. Veuillez réessayer dans un instant.',
            context: { guildId, userId, reason }
        });
        logger.error('Error removing verification', {
            guildId,
            userId,
            error: typedError.message,
            errorCode: typedError.context?.errorCode
        });
        throw typedError;
    }
}

export async function validateVerificationSetup(guild, verificationConfig) {
    const botMember = guild.members.me;
    if (!botMember) {
        throw createError(
            'Bot member not available in guild cache',
            ErrorTypes.CONFIGURATION,
            "Je n'ai pas pu vérifier les permissions du serveur. Veuillez réessayer.",
            { guildId: guild.id }
        );
    }

    const verifiedRole = guild.roles.cache.get(verificationConfig.roleId);
    if (!verifiedRole) {
        throw createError(
            "Verified role not found",
            ErrorTypes.CONFIGURATION,
            "Le rôle de vérification a été supprimé. Veuillez relancer `/verification setup`.",
            { roleId: verificationConfig.roleId, guildId: guild.id }
        );
    }

    if (verificationConfig.channelId) {
        const channel = guild.channels.cache.get(verificationConfig.channelId);
        if (!channel) {
            throw createError(
                "Verification channel not found",
                ErrorTypes.CONFIGURATION,
                "Le salon de vérification a été supprimé.",
                { channelId: verificationConfig.channelId, guildId: guild.id }
            );
        }

        const botPerms = channel.permissionsFor(botMember);
        const requiredPerms = ['ViewChannel', 'SendMessages', 'EmbedLinks'];
        const missingPerms = requiredPerms.filter(perm => !botPerms.has(perm));

        if (missingPerms.length > 0) {
            throw createError(
                "Bot missing permissions in verification channel",
                ErrorTypes.PERMISSION,
                `Il me manque des permissions dans le salon de vérification : ${missingPerms.join(', ')}`,
                { missingPerms, channelId: channel.id }
            );
        }
    }

    return true;
}

export async function validateBotCanAssignRole(guild, roleId) {
    const role = guild.roles.cache.get(roleId);
    
    if (!role) {
        logger.warn('Cannot assign role - role not found', {
            guildId: guild.id,
            roleId
        });
        return false;
    }

    const botMember = guild.members.me;
    if (!botMember) {
        logger.warn('Cannot assign role - bot member not found in guild cache', {
            guildId: guild.id,
            roleId
        });
        return false;
    }

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        logger.warn('Cannot assign role - missing ManageRoles permission', {
            guildId: guild.id,
            roleId
        });
        return false;
    }

    const botHighest = botMember.roles.highest;
    if (role.position >= botHighest.position) {
        logger.warn('Cannot assign role - role hierarchy issue', {
            guildId: guild.id,
            roleId,
            rolePosition: role.position,
            botHighestPosition: botHighest.position
        });
        return false;
    }

    return true;
}

function evaluateAutoVerifyCriteria(member, autoVerifyConfig) {
    const { criteria, accountAgeDays } = autoVerifyConfig;

    switch (criteria) {
        case 'account_age': {
            const accountAge = Date.now() - member.user.createdTimestamp;
            const requiredAge = accountAgeDays * 24 * 60 * 60 * 1000;
            return accountAge >= requiredAge;
        }

        case 'server_size':
            return member.guild.memberCount < serverSizeThreshold;

        case 'none':
            return true;

        default:
            logger.warn('Unknown auto-verify criteria', { criteria });
            return false;
    }
}

export async function checkVerificationCooldown(userId, guildId, cooldownMs = defaultCooldownMs) {
    pruneVerificationTrackers();

    const key = `${guildId}:${userId}`;
    const lastVerified = verificationCooldowns.get(key);
    
    if (lastVerified && Date.now() - lastVerified < cooldownMs) {
        const remaining = cooldownMs - (Date.now() - lastVerified);
        throw createError(
            "User on verification cooldown",
            ErrorTypes.RATE_LIMIT,
            `Veuillez patienter ${Math.ceil(remaining / 1000)} seconde(s) avant de réessayer la vérification.`,
            { userId, guildId, cooldownRemaining: remaining }
        );
    }
    
    verificationCooldowns.set(key, Date.now());
}

export async function trackVerificationAttempt(
    userId,
    guildId,
    maxAttempts = defaultMaxAttempts,
    windowMs = defaultAttemptWindowMs
) {
    pruneVerificationTrackers();

    const key = `${guildId}:${userId}`;
    const attempts = attemptTracker.get(key) || [];
    const now = Date.now();

    const recentAttempts = attempts.filter(timestamp => now - timestamp < windowMs);

    if (recentAttempts.length >= maxAttempts) {
        throw createError(
            "Too many verification attempts",
            ErrorTypes.RATE_LIMIT,
            "Vous avez effectué trop de tentatives. Veuillez patienter quelques instants.",
            { attempts: recentAttempts.length, maxAttempts }
        );
    }

    recentAttempts.push(now);
    attemptTracker.set(key, recentAttempts);
}

async function sendAutoVerifyNotification(member, role, guild) {
    try {
        const { createEmbed } = await import('../utils/embeds.js');
        
        const embed = createEmbed({
            title: "🎉 Bienvenue sur le serveur !",
            description: `Vous avez été automatiquement vérifié sur **${guild.name}** !`,
            fields: [
                {
                    name: "✅ Rôle attribué",
                    value: `Vous avez maintenant le rôle ${role} !`,
                    inline: false
                },
                {
                    name: "📖 Et maintenant ?",
                    value: "Vous avez maintenant accès à tous les salons et fonctionnalités du serveur. Bienvenue !",
                    inline: false
                }
            ],
            color: 'success'
        });

        await member.send({ embeds: [embed] });
    } catch (error) {
        logger.debug('Could not send auto-verify DM notification', {
            userId: member.id,
            guildId: guild.id,
            reason: error.message
        });
        
    }
}

function logVerificationAction(client, guildId, userId, action, metadata = {}) {
    if (!shouldLogVerifications) {
        return;
    }

    const sanitizedMetadata = sanitizeAuditMetadata(metadata);

    logger.info('Verification action', {
        guildId,
        userId,
        action,
        timestamp: new Date().toISOString(),
        metadata: sanitizedMetadata
    });

    if (!shouldKeepAuditTrail) {
        return;
    }

    const moderatorId = metadata.moderatorId || metadata.removedBy || null;
    const source = metadata.source || null;

    void insertVerificationAudit({
        guildId,
        userId,
        action,
        source,
        moderatorId,
        metadata: sanitizedMetadata,
        createdAt: new Date().toISOString()
    });
}

function sanitizeAuditMetadata(metadata = {}) {
    try {
        const payload = metadata && typeof metadata === 'object' ? metadata : { value: metadata };
        const json = JSON.stringify(payload);

        if (!json) {
            return {};
        }

        if (Buffer.byteLength(json, 'utf8') <= maxAuditMetadataBytes) {
            return payload;
        }

        return {
            truncated: true,
            originalBytes: Buffer.byteLength(json, 'utf8'),
            preview: json.slice(0, Math.max(0, maxAuditMetadataBytes - 32))
        };
    } catch {
        return {
            invalidMetadata: true,
            reason: 'Échec de la sérialisation des métadonnées'
        };
    }
}

export function validateAutoVerifyCriteria(criteria, accountAgeDays) {
    const validCriteria = ['account_age', 'server_size', 'none'];
    
    if (!validCriteria.includes(criteria)) {
        throw createError(
            `Invalid auto-verify criteria: ${criteria}`,
            ErrorTypes.VALIDATION,
            "Veuillez sélectionner une option de critère valide.",
            { criteria, validCriteria }
        );
    }
    
    if (criteria === 'account_age') {
        if (!accountAgeDays || accountAgeDays < minAutoVerifyAccountAgeDays || accountAgeDays > maxAutoVerifyAccountAgeDays) {
            throw createError(
                "Invalid account age days",
                ErrorTypes.VALIDATION,
                `L'ancienneté du compte doit être comprise entre ${minAutoVerifyAccountAgeDays} et ${maxAutoVerifyAccountAgeDays} jours.`,
                { accountAgeDays, minAutoVerifyAccountAgeDays, maxAutoVerifyAccountAgeDays }
            );
        }
    }
    
    return { criteria, accountAgeDays };
}

export default {
    verifyUser,
    autoVerifyOnJoin,
    removeVerification,
    validateVerificationSetup,
    validateBotCanAssignRole,
    checkVerificationCooldown,
    trackVerificationAttempt,
    validateAutoVerifyCriteria
};

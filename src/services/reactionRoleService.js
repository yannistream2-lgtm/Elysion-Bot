
// reactionRoleService.js

import { logger } from '../utils/logger.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { getReactionRoleKey, getReactionRolesPrefix } from '../utils/database/keys.js';

const MAX_ROLES_PER_MESSAGE = 25;

const DANGEROUS_PERMISSIONS = [
    'Administrator',
    'ManageGuild',
    'ManageRoles',
    'ManageChannels',
    'ManageWebhooks',
    'BanMembers',
    'KickMembers'
];

function validateGuildId(guildId) {
    if (!guildId || typeof guildId !== 'string' || !/^\d{17,19}$/.test(guildId)) {
        throw createError(
            `Identifiant du serveur invalide : ${guildId}`,
            ErrorTypes.VALIDATION,
            'L’identifiant du serveur fourni est invalide.',
            { guildId }
        );
    }
}

function validateMessageId(messageId) {
    if (!messageId || typeof messageId !== 'string' || !/^\d{17,19}$/.test(messageId)) {
        throw createError(
            `Identifiant du message invalide : ${messageId}`,
            ErrorTypes.VALIDATION,
            'L’identifiant du message fourni est invalide.',
            { messageId }
        );
    }
}

function validateRoleId(roleId) {
    if (!roleId || typeof roleId !== 'string' || !/^\d{17,19}$/.test(roleId)) {
        throw createError(
            `Identifiant du rôle invalide : ${roleId}`,
            ErrorTypes.VALIDATION,
            'L’identifiant du rôle fourni est invalide.',
            { roleId }
        );
    }
}

export function hasDangerousPermissions(role) {
    if (!role || !role.permissions) return false;
    
    for (const permission of DANGEROUS_PERMISSIONS) {
        if (role.permissions.has(permission)) {
            return true;
        }
    }
    return false;
}

async function validateRoleSafety(client, guildId, roleId) {
    const guild = client.guilds?.cache?.get(guildId) || await client.guilds?.fetch?.(guildId).catch(() => null);

    if (!guild) {
        throw createError(
            `Serveur introuvable lors de la validation du rôle : ${guildId}`,
            ErrorTypes.VALIDATION,
            'Serveur introuvable lors de la validation des rôles par réaction.',
            { guildId, roleId }
        );
    }

    const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);

    if (!role) {
        throw createError(
            `Rôle introuvable : ${roleId}`,
            ErrorTypes.VALIDATION,
            'Un ou plusieurs rôles sélectionnés n’existent plus.',
            { guildId, roleId }
        );
    }

    if (hasDangerousPermissions(role)) {
        throw createError(
            `Permission dangereuse détectée sur le rôle : ${roleId}`,
            ErrorTypes.PERMISSION,
            'Pour des raisons de sécurité, les rôles disposant de privilèges élevés ne peuvent pas être attribués via les rôles par réaction.',
            {
                guildId,
                roleId,
                roleName: role.name,
                dangerousPermissions: DANGEROUS_PERMISSIONS
            }
        );
    }

    const botHighestRole = guild.members.me?.roles?.highest;

    if (!botHighestRole || role.position >= botHighestRole.position) {
        throw createError(
            `Rôle situé au-dessus de la hiérarchie du bot : ${roleId}`,
            ErrorTypes.PERMISSION,
            'Je ne peux pas attribuer ce rôle car il est au même niveau ou au-dessus de mon rôle le plus élevé.',
            {
                guildId,
                roleId,
                rolePosition: role.position,
                botRolePosition: botHighestRole?.position
            }
        );
    }
}

export async function getReactionRoleMessage(client, guildId, messageId) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        const key = getReactionRoleKey(guildId, messageId);
        const data = await client.db.get(key);

        return data || null;

    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }

        logger.error(
            `Erreur lors de la récupération du message de rôles par réaction ${messageId} sur le serveur ${guildId} :`,
            error
        );

        throw createError(
            'Erreur de base de données lors de la récupération du message de rôles par réaction',
            ErrorTypes.DATABASE,
            'Impossible de récupérer les données des rôles par réaction. Veuillez réessayer.',
            {
                guildId,
                messageId,
                originalError: error.message
            }
        );
    }
}

export async function createReactionRoleMessage(client, guildId, channelId, messageId, roleIds) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        if (!channelId || typeof channelId !== 'string' || !/^\d{17,19}$/.test(channelId)) {
            throw createError(
                `Identifiant du salon invalide : ${channelId}`,
                ErrorTypes.VALIDATION,
                'L’identifiant du salon fourni est invalide.',
                { channelId }
            );
        }
        
        if (!Array.isArray(roleIds) || roleIds.length === 0) {
            throw createError(
                'Aucun rôle fourni',
                ErrorTypes.VALIDATION,
                'Vous devez fournir au moins un rôle.',
                { roleIds }
            );
        }
        
        if (roleIds.length > MAX_ROLES_PER_MESSAGE) {
            throw createError(
                `Trop de rôles : ${roleIds.length}`,
                ErrorTypes.VALIDATION,
                `Vous pouvez ajouter au maximum ${MAX_ROLES_PER_MESSAGE} rôles par message de rôles par réaction.`,
                {
                    roleIds,
                    limit: MAX_ROLES_PER_MESSAGE
                }
            );
        }

        for (const roleId of roleIds) {
            validateRoleId(roleId);
            await validateRoleSafety(client, guildId, roleId);
        }
        
        const reactionRoleData = {
            guildId,
            channelId,
            messageId,
            roles: roleIds,
            createdAt: new Date().toISOString()
        };
        
        const key = getReactionRoleKey(guildId, messageId);
        await client.db.set(key, reactionRoleData);
        
        logger.info(
            `Message de rôles par réaction ${messageId} créé sur le serveur ${guildId} avec ${roleIds.length} rôles`
        );

        return reactionRoleData;

    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }

        logger.error(
            `Erreur lors de la création du message de rôles par réaction sur le serveur ${guildId} :`,
            error
        );

        throw createError(
            'Erreur de base de données lors de la création du message de rôles par réaction',
            ErrorTypes.DATABASE,
            'Impossible d’enregistrer les données des rôles par réaction. Veuillez réessayer.',
            {
                guildId,
                messageId,
                originalError: error.message
            }
        );
    }
}

export async function addReactionRole(client, guildId, messageId, emoji, roleId) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        validateRoleId(roleId);

        await validateRoleSafety(client, guildId, roleId);
        
        const key = getReactionRoleKey(guildId, messageId);

        const data = await getReactionRoleMessage(client, guildId, messageId) || {
            messageId,
            guildId,
            channelId: '',
            roles: {}
        };

        data.roles[emoji] = roleId;
        
        await client.db.set(key, data);

        logger.info(
            `Rôle par réaction ajouté pour l’emoji ${emoji} au message ${messageId} sur le serveur ${guildId}`
        );

        return true;

    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }

        logger.error(
            `Erreur lors de l’ajout du rôle par réaction sur le serveur ${guildId} :`,
            error
        );

        throw createError(
            'Erreur de base de données lors de l’ajout du rôle par réaction',
            ErrorTypes.DATABASE,
            'Impossible d’ajouter le rôle par réaction. Veuillez réessayer.',
            {
                guildId,
                messageId,
                originalError: error.message
            }
        );
    }
}

export async function deleteReactionRoleMessage(client, guildId, messageId) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        const key = getReactionRoleKey(guildId, messageId);
        const data = await getReactionRoleMessage(client, guildId, messageId);
        
        if (!data) {
            logger.debug(
                `Le message de rôles par réaction ${messageId} n’existe pas sur le serveur ${guildId}, aucune suppression nécessaire`
            );

            return true;
        }
        
        await client.db.delete(key);

        logger.info(
            `Message de rôles par réaction ${messageId} supprimé du serveur ${guildId}`
        );

        return true;

    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }

        logger.error(
            `Erreur lors de la suppression du message de rôles par réaction sur le serveur ${guildId} :`,
            error
        );

        throw createError(
            'Erreur de base de données lors de la suppression du message de rôles par réaction',
            ErrorTypes.DATABASE,
            'Impossible de supprimer le message de rôles par réaction. Veuillez réessayer.',
            {
                guildId,
                messageId,
                originalError: error.message
            }
        );
    }
}

export async function removeReactionRole(client, guildId, messageId, emoji) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        const key = getReactionRoleKey(guildId, messageId);
        const data = await getReactionRoleMessage(client, guildId, messageId);
        
        if (!data || !data.roles[emoji]) {
            return false;
        }

        delete data.roles[emoji];

        if (Object.keys(data.roles).length === 0) {
            await client.db.delete(key);

            logger.info(
                `Dernier rôle par réaction supprimé du message ${messageId}, données du message supprimées`
            );

        } else {
            await client.db.set(key, data);

            logger.info(
                `Rôle par réaction associé à l’emoji ${emoji} supprimé du message ${messageId}`
            );
        }
        
        return true;

    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }

        logger.error(
            `Erreur lors de la suppression du rôle par réaction sur le serveur ${guildId} :`,
            error
        );

        throw createError(
            'Erreur de base de données lors de la suppression du rôle par réaction',
            ErrorTypes.DATABASE,
            'Impossible de supprimer le rôle par réaction. Veuillez réessayer.',
            {
                guildId,
                messageId,
                originalError: error.message
            }
        );
    }
}

export async function getAllReactionRoleMessages(client, guildId) {
    try {
        validateGuildId(guildId);
        
        const prefix = getReactionRolesPrefix(guildId);
        
        let keys;

        try {
            keys = await client.db.list(prefix);
            
            if (keys && typeof keys === 'object') {
                if (Array.isArray(keys)) {
                    
                } else if (keys.value && Array.isArray(keys.value)) {
                    keys = keys.value;

                } else {
                    const allKeys = await client.db.list();
                    
                    if (Array.isArray(allKeys)) {
                        keys = allKeys.filter(key => key.startsWith(prefix));

                    } else if (allKeys.value && Array.isArray(allKeys.value)) {
                        keys = allKeys.value.filter(key => key.startsWith(prefix));

                    } else {
                        return [];
                    }
                }
            } else {
                return [];
            }

        } catch (listError) {
            logger.error(
                `Erreur lors de la récupération des clés de rôles par réaction pour le serveur ${guildId} :`,
                listError
            );

            throw createError(
                'Erreur de base de données lors de la récupération des rôles par réaction',
                ErrorTypes.DATABASE,
                'Impossible de récupérer la liste des rôles par réaction. Veuillez réessayer.',
                {
                    guildId,
                    originalError: listError.message
                }
            );
        }
        
        if (!keys || keys.length === 0) {
            return [];
        }

        const messages = [];
        
        for (const key of keys) {
            try {
                const data = await client.db.get(key);
                
                if (data) {
                    let actualData;

                    if (data && data.ok && data.value) {
                        actualData = data.value;

                    } else if (data && data.value) {
                        actualData = data.value;

                    } else {
                        actualData = data;
                    }
                    
                    if (actualData && actualData.messageId && actualData.channelId) {
                        messages.push(actualData);

                    } else if (actualData) {
                        logger.warn(
                            `Données de rôles par réaction invalides ignorées pour le serveur ${guildId} :`,
                            actualData
                        );
                    }
                }

            } catch (dataError) {
                logger.warn(
                    `Erreur lors de la récupération des données pour la clé de rôles par réaction ${key} :`,
                    dataError
                );
            }
        }

        return messages;

    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }

        logger.error(
            `Erreur lors de la récupération de tous les messages de rôles par réaction pour le serveur ${guildId} :`,
            error
        );

        throw createError(
            'Erreur de base de données lors de la récupération des rôles par réaction',
            ErrorTypes.DATABASE,
            'Impossible de récupérer les messages de rôles par réaction. Veuillez réessayer.',
            {
                guildId,
                originalError: error.message
            }
        );
    }
}

export async function setReactionRoleChannel(client, guildId, messageId, channelId) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        if (!channelId || typeof channelId !== 'string' || !/^\d{17,19}$/.test(channelId)) {
            throw createError(
                `Identifiant du salon invalide : ${channelId}`,
                ErrorTypes.VALIDATION,
                'L’identifiant du salon fourni est invalide.',
                { channelId }
            );
        }
        
        const key = getReactionRoleKey(guildId, messageId);

        const data = await getReactionRoleMessage(client, guildId, messageId) || {
            messageId,
            guildId,
            channelId: '',
            roles: {}
        };

        data.channelId = channelId;

        await client.db.set(key, data);

        logger.info(
            `Salon ${channelId} associé au message de rôles par réaction ${messageId}`
        );

        return true;

    } catch (error) {
        if (error.name === 'TitanBotError') {
            throw error;
        }

        logger.error(
            `Erreur lors de la configuration du salon pour le message de rôles par réaction ${messageId} :`,
            error
        );

        throw createError(
            'Erreur de base de données lors de la configuration du salon des rôles par réaction',
            ErrorTypes.DATABASE,
            'Impossible de mettre à jour le salon des rôles par réaction. Veuillez réessayer.',
            {
                guildId,
                messageId,
                channelId,
                originalError: error.message
            }
        );
    }
}

export async function reconcileReactionRoleMessages(client, guildId = null) {
    const summary = {
        scannedGuilds: 0,
        scannedMessages: 0,
        removedMessages: 0,
        errors: 0
    };

    try {
        const targetGuildIds = guildId
            ? [guildId]
            : Array.from(client.guilds.cache.keys());

        for (const targetGuildId of targetGuildIds) {
            summary.scannedGuilds += 1;

            let reactionRoleMessages = [];

            try {
                reactionRoleMessages = await getAllReactionRoleMessages(client, targetGuildId);

            } catch (error) {
                summary.errors += 1;

                logger.warn(
                    `Impossible de récupérer les messages de rôles par réaction pour la vérification du serveur ${targetGuildId} :`,
                    error
                );

                continue;
            }

            if (!reactionRoleMessages.length) {
                continue;
            }

            const guild = client.guilds.cache.get(targetGuildId)
                || await client.guilds.fetch(targetGuildId).catch(() => null);

            if (!guild) {
                for (const reactionRoleMessage of reactionRoleMessages) {
                    summary.scannedMessages += 1;

                    await client.db.delete(
                        getReactionRoleKey(targetGuildId, reactionRoleMessage.messageId)
                    );

                    summary.removedMessages += 1;
                }

                logger.info(
                    `${reactionRoleMessages.length} ancien(s) message(s) de rôles par réaction supprimé(s) pour le serveur indisponible ${targetGuildId}`
                );

                continue;
            }

            for (const reactionRoleMessage of reactionRoleMessages) {
                summary.scannedMessages += 1;

                try {
                    const channel = guild.channels.cache.get(reactionRoleMessage.channelId)
                        || await guild.channels.fetch(reactionRoleMessage.channelId).catch(() => null);

                    if (!channel || !channel.isTextBased?.()) {
                        await client.db.delete(
                            getReactionRoleKey(targetGuildId, reactionRoleMessage.messageId)
                        );

                        summary.removedMessages += 1;
                        continue;
                    }

                    const message = await channel.messages
                        .fetch(reactionRoleMessage.messageId)
                        .catch(() => null);

                    if (!message) {
                        await client.db.delete(
                            getReactionRoleKey(targetGuildId, reactionRoleMessage.messageId)
                        );

                        summary.removedMessages += 1;
                    }

                } catch (messageCheckError) {
                    summary.errors += 1;

                    logger.warn(
                        `Impossible de vérifier le message de rôles par réaction ${reactionRoleMessage.messageId} lors de la réconciliation :`,
                        messageCheckError
                    );
                }
            }
        }

        logger.info(
            `Réconciliation des rôles par réaction terminée : ${summary.scannedMessages} message(s) vérifié(s) sur ${summary.scannedGuilds} serveur(s), ${summary.removedMessages} supprimé(s), ${summary.errors} erreur(s)`
        );

        return summary;

    } catch (error) {
        logger.error(
            'Erreur inattendue lors de la réconciliation des rôles par réaction :',
            error
        );

        summary.errors += 1;

        return summary;
    }
}

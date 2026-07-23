// joinToCreateService.js

import {
    getJoinToCreateConfig,
    saveJoinToCreateConfig,
    updateJoinToCreateConfig,
    getTemporaryChannelInfo,
    formatChannelName as formatChannelNameUtil
} from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../utils/errorHandler.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';
import { formatLogLine } from '../utils/logging/logEmbeds.js';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

const CHANNEL_NAME_MAX_LENGTH = 100;
const CHANNEL_VARIABLE_MAX_LENGTH = 32;
const CONTROL_AND_INVISIBLE_CHARS_REGEX = /[\x00-\x1F\x7F\u200B-\u200D\uFEFF]/g;

const ALLOWED_TEMPLATE_PLACEHOLDERS = new Set([
    '{username}',
    '{user_tag}',
    '{displayName}',
    '{display_name}',
    '{guildName}',
    '{guild_name}',
    '{channelName}',
    '{channel_name}'
]);

export function validateChannelNameTemplate(template) {
    if (!template || typeof template !== 'string') {
        throw new TitanBotError(
            'Modèle de nom de salon invalide : le texte ne peut pas être vide',
            ErrorTypes.VALIDATION,
            'Le modèle du nom du salon doit être un texte valide.'
        );
    }

    const normalizedTemplate = template
        .normalize('NFKC')
        .replace(CONTROL_AND_INVISIBLE_CHARS_REGEX, '')
        .trim();

    if (normalizedTemplate.length > CHANNEL_NAME_MAX_LENGTH) {
        throw new TitanBotError(
            'Le modèle du nom du salon dépasse la longueur maximale',
            ErrorTypes.VALIDATION,
            `Le modèle du nom du salon ne peut pas dépasser ${CHANNEL_NAME_MAX_LENGTH} caractères.`
        );
    }

    if (/[@#:`]/.test(normalizedTemplate)) {
        throw new TitanBotError(
            'Le modèle du salon contient des caractères interdits',
            ErrorTypes.VALIDATION,
            'Le modèle du salon ne peut pas contenir les caractères @, #, : ou `.'
        );
    }

    const placeholders = normalizedTemplate.match(/\{[^}]+\}/g) || [];

    for (const placeholder of placeholders) {
        if (!ALLOWED_TEMPLATE_PLACEHOLDERS.has(placeholder)) {
            throw new TitanBotError(
                'Le modèle du salon contient des paramètres inconnus',
                ErrorTypes.VALIDATION,
                `Paramètre inconnu : ${placeholder}. Les paramètres autorisés sont : ${Array.from(ALLOWED_TEMPLATE_PLACEHOLDERS).join(', ')}`
            );
        }
    }

    return true;
}

export function validateBitrate(bitrate) {
    const bitrateNum = parseInt(bitrate);

    if (isNaN(bitrateNum)) {
        throw new TitanBotError(
            'Le débit doit être un nombre valide',
            ErrorTypes.VALIDATION,
            'Veuillez entrer un nombre valide pour le débit.'
        );
    }

    if (bitrateNum < 8 || bitrateNum > 384) {
        throw new TitanBotError(
            'Le débit est en dehors de la plage autorisée',
            ErrorTypes.VALIDATION,
            'Le débit doit être compris entre 8 et 384 kbps.'
        );
    }

    return true;
}

export function validateUserLimit(limit) {
    const limitNum = parseInt(limit);

    if (isNaN(limitNum)) {
        throw new TitanBotError(
            'La limite d’utilisateurs doit être un nombre valide',
            ErrorTypes.VALIDATION,
            'Veuillez entrer un nombre valide pour la limite d’utilisateurs.'
        );
    }

    if (limitNum < 0 || limitNum > 99) {
        throw new TitanBotError(
            'La limite d’utilisateurs est en dehors de la plage autorisée',
            ErrorTypes.VALIDATION,
            'La limite d’utilisateurs doit être comprise entre 0 (aucune limite) et 99.'
        );
    }

    return true;
}

export function formatChannelName(template, variables) {
    try {
        const safeTemplate = template
            .normalize('NFKC')
            .replace(CONTROL_AND_INVISIBLE_CHARS_REGEX, '')
            .trim();

        validateChannelNameTemplate(safeTemplate);

        if (!variables || typeof variables !== 'object') {
            throw new TitanBotError(
                'Objet de variables invalide pour le formatage du salon',
                ErrorTypes.VALIDATION
            );
        }

        const sanitized = {};

        for (const [key, value] of Object.entries(variables)) {
            if (value === null || value === undefined) {
                sanitized[key] = 'Inconnu';
            } else {
                sanitized[key] = String(value)
                    .normalize('NFKC')
                    .replace(CONTROL_AND_INVISIBLE_CHARS_REGEX, '')
                    .replace(/[@#:`\n\r\t]/g, '')
                    .trim()
                    .substring(0, CHANNEL_VARIABLE_MAX_LENGTH);
            }
        }

        const replacements = {
            '{username}': sanitized.username || 'Utilisateur',
            '{user_tag}': sanitized.userTag || 'Utilisateur#0000',
            '{displayName}': sanitized.displayName || 'Utilisateur',
            '{display_name}': sanitized.displayName || 'Utilisateur',
            '{guildName}': sanitized.guildName || 'Serveur',
            '{guild_name}': sanitized.guildName || 'Serveur',
            '{channelName}': sanitized.channelName || 'Salon vocal',
            '{channel_name}': sanitized.channelName || 'Salon vocal',
        };

        let formatted = safeTemplate;

        for (const [placeholder, value] of Object.entries(replacements)) {
            formatted = formatted.replace(
                new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'),
                value
            );
        }

        formatted = formatted
            .normalize('NFKC')
            .replace(CONTROL_AND_INVISIBLE_CHARS_REGEX, '')
            .replace(/[@#:`\n\r\t]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (formatted.length === 0) {
            formatted = 'Salon vocal';
        } else if (formatted.length > CHANNEL_NAME_MAX_LENGTH) {
            formatted = formatted.substring(0, CHANNEL_NAME_MAX_LENGTH);
        }

        logger.debug(
            `Nom du salon formaté : "${formatted}" à partir du modèle "${template}"`
        );

        return formatted;

    } catch (error) {
        logger.error('Erreur lors du formatage du nom du salon :', error);
        throw error;
    }
}

export async function initializeJoinToCreate(client, guildId, channelId, options = {}) {
    try {
        if (!client || !client.db) {
            throw new TitanBotError(
                'Service de base de données indisponible',
                ErrorTypes.DATABASE,
                'Une erreur système est survenue. Veuillez réessayer plus tard.'
            );
        }

        if (!guildId || !channelId) {
            throw new TitanBotError(
                'Identifiant du serveur ou du salon manquant',
                ErrorTypes.VALIDATION,
                'Les informations du serveur ou du salon fournies sont invalides.'
            );
        }

        if (options.nameTemplate) {
            validateChannelNameTemplate(options.nameTemplate);
        }

        if (options.bitrate) {
            validateBitrate(options.bitrate / 1000);
        }

        if (options.userLimit !== undefined) {
            validateUserLimit(options.userLimit);
        }

        const config = await getJoinToCreateConfig(client, guildId);

        if (config.triggerChannels.includes(channelId)) {
            throw new TitanBotError(
                'Le salon est déjà configuré comme déclencheur Join to Create',
                ErrorTypes.VALIDATION,
                'Ce salon est déjà configuré comme déclencheur Join to Create.'
            );
        }

        if (
            Array.isArray(config.triggerChannels) &&
            config.triggerChannels.length > 0
        ) {
            throw new TitanBotError(
                'Le serveur possède déjà un déclencheur Join to Create',
                ErrorTypes.VALIDATION,
                'Ce serveur possède déjà un salon Join to Create configuré. Utilisez `/jointocreate dashboard` pour le modifier ou supprimez-le avant d’en créer un nouveau.',
                {
                    guildId,
                    existingTriggerChannelId: config.triggerChannels[0],
                    expected: true,
                    suppressErrorLog: true
                }
            );
        }

        config.triggerChannels.push(channelId);
        config.enabled = true;

        if (Object.keys(options).length > 0) {
            if (!config.channelOptions) {
                config.channelOptions = {};
            }

            config.channelOptions[channelId] = {
                nameTemplate: options.nameTemplate || config.channelNameTemplate,
                userLimit:
                    options.userLimit !== undefined
                        ? options.userLimit
                        : config.userLimit,
                bitrate: options.bitrate || config.bitrate,
                categoryId: options.categoryId || null,
                createdAt: Date.now()
            };
        }

        const saveResult = await saveJoinToCreateConfig(
            client,
            guildId,
            config
        );

        if (!saveResult) {
            throw new TitanBotError(
                'Impossible d’enregistrer la configuration Join to Create',
                ErrorTypes.DATABASE,
                'Impossible de configurer le système Join to Create. Veuillez réessayer.'
            );
        }

        logger.info(
            `Join to Create initialisé pour le serveur ${guildId} avec le salon déclencheur ${channelId}`
        );

        return config;

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }

        throw new TitanBotError(
            `Impossible d’initialiser Join to Create : ${error.message}`,
            ErrorTypes.DATABASE,
            'Impossible de configurer le système Join to Create.'
        );
    }
}

export async function updateChannelConfig(
    client,
    guildId,
    channelId,
    updates
) {
    try {
        if (!client || !client.db) {
            throw new TitanBotError(
                'Service de base de données indisponible',
                ErrorTypes.DATABASE,
                'Le service de base de données est actuellement indisponible. Veuillez réessayer plus tard.'
            );
        }

        const config = await getJoinToCreateConfig(client, guildId);

        if (!config.triggerChannels.includes(channelId)) {
            throw new TitanBotError(
                'Le salon n’est pas configuré comme déclencheur Join to Create',
                ErrorTypes.VALIDATION,
                'Ce salon n’est pas configuré comme déclencheur Join to Create.'
            );
        }

        if (updates.nameTemplate) {
            validateChannelNameTemplate(updates.nameTemplate);
        }

        if (updates.bitrate !== undefined) {
            validateBitrate(updates.bitrate / 1000);
        }

        if (updates.userLimit !== undefined) {
            validateUserLimit(updates.userLimit);
        }

        if (!config.channelOptions) {
            config.channelOptions = {};
        }

        config.channelOptions[channelId] = {
            ...config.channelOptions[channelId],
            ...updates,
            updatedAt: Date.now()
        };

        await saveJoinToCreateConfig(client, guildId, config);

        logger.info(
            `Configuration Join to Create mise à jour pour le salon ${channelId} du serveur ${guildId}`,
            {
                updates: Object.keys(updates)
            }
        );

        return config.channelOptions[channelId];

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }

        throw new TitanBotError(
            `Impossible de mettre à jour la configuration du salon : ${error.message}`,
            ErrorTypes.DATABASE,
            'Impossible de mettre à jour la configuration.'
        );
    }
}

export async function removeTriggerChannel(
    client,
    guildId,
    channelId
) {
    try {
        if (!client || !client.db) {
            throw new TitanBotError(
                'Service de base de données indisponible',
                ErrorTypes.DATABASE,
                'Le service de base de données est actuellement indisponible. Veuillez réessayer plus tard.'
            );
        }

        const config = await getJoinToCreateConfig(client, guildId);

        const index = config.triggerChannels.indexOf(channelId);

        if (index === -1) {
            throw new TitanBotError(
                'Salon introuvable dans les déclencheurs Join to Create',
                ErrorTypes.VALIDATION,
                'Ce salon n’est pas configuré comme déclencheur Join to Create.'
            );
        }

        config.triggerChannels.splice(index, 1);
        config.enabled = config.triggerChannels.length > 0;

        if (
            config.channelOptions &&
            config.channelOptions[channelId]
        ) {
            delete config.channelOptions[channelId];
        }

        if (config.temporaryChannels) {
            for (
                const [tempChannelId, tempInfo]
                of Object.entries(config.temporaryChannels)
            ) {
                if (tempInfo.triggerChannelId === channelId) {
                    delete config.temporaryChannels[tempChannelId];
                }
            }
        }

        await saveJoinToCreateConfig(client, guildId, config);

        logger.info(
            `Salon déclencheur Join to Create ${channelId} supprimé du serveur ${guildId}`
        );

        return true;

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }

        throw new TitanBotError(
            `Impossible de supprimer le salon déclencheur : ${error.message}`,
            ErrorTypes.DATABASE,
            'Impossible de supprimer le salon déclencheur.'
        );
    }
}

export async function getConfiguration(client, guildId) {
    try {
        if (!client || !client.db) {
            throw new TitanBotError(
                'Service de base de données indisponible',
                ErrorTypes.DATABASE,
                'Le service de base de données est actuellement indisponible. Veuillez réessayer plus tard.'
            );
        }

        return await getJoinToCreateConfig(client, guildId);

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }

        throw new TitanBotError(
            `Impossible de récupérer la configuration : ${error.message}`,
            ErrorTypes.DATABASE,
            'Impossible de récupérer les paramètres.'
        );
    }
}

export async function isTriggerChannel(
    client,
    guildId,
    channelId
) {
    try {
        const config = await getConfiguration(client, guildId);
        return config.triggerChannels.includes(channelId);
    } catch (error) {
        logger.error(
            `Erreur lors de la vérification du salon déclencheur : ${error.message}`
        );
        return false;
    }
}

export async function getChannelConfiguration(
    client,
    guildId,
    channelId
) {
    try {
        const config = await getConfiguration(client, guildId);

        if (
            !config.triggerChannels ||
            !Array.isArray(config.triggerChannels) ||
            !config.triggerChannels.includes(channelId)
        ) {
            throw new TitanBotError(
                'Le salon n’est pas un déclencheur Join to Create valide',
                ErrorTypes.VALIDATION,
                'Ce salon n’est pas configuré comme déclencheur Join to Create.'
            );
        }

        return {
            ...config,
            channelConfig:
                config.channelOptions?.[channelId] || {}
        };

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }

        throw new TitanBotError(
            `Impossible de récupérer la configuration du salon : ${error.message}`,
            ErrorTypes.DATABASE,
            'Impossible de récupérer la configuration du salon. Veuillez réessayer.'
        );
    }
}

export function hasManageGuildPermission(member) {
    try {
        if (!member || !member.permissions) {
            return false;
        }

        return member.permissions.has(
            PermissionFlagsBits.ManageGuild
        );

    } catch (error) {
        logger.error(
            'Erreur lors de la vérification de la permission ManageGuild :',
            error
        );
        return false;
    }
}

export async function logConfigurationChange(
    client,
    guildId,
    userId,
    action,
    details
) {
    try {
        await logEvent({
            client,
            guildId,
            eventType: EVENT_TYPES.COUNTER_CONFIG,
            data: {
                title: 'Configuration Join to Create mise à jour',
                lines: [
                    formatLogLine('Action', action),
                    formatLogLine(
                        'Détails',
                        typeof details === 'string'
                            ? details
                            : JSON.stringify(details)
                    ),
                ],
                userId,
            },
        });

    } catch (error) {
        logger.warn(
            `Impossible d’enregistrer la modification de configuration Join to Create : ${error.message}`
        );
    }
}

export async function createTemporaryChannel(
    guild,
    member,
    options = {}
) {
    try {
        if (!guild || !member) {
            throw new TitanBotError(
                'Serveur ou membre invalide',
                ErrorTypes.VALIDATION
            );
        }

        const {
            nameTemplate,
            userLimit,
            bitrate,
            parentId
        } = options;

        if (nameTemplate) {
            validateChannelNameTemplate(nameTemplate);
        }

        if (userLimit !== undefined) {
            validateUserLimit(userLimit);
        }

        if (bitrate !== undefined) {
            validateBitrate(bitrate / 1000);
        }

        const channelName = formatChannelName(
            nameTemplate || '{username}\'s Room',
            {
                username: member.user.username,
                displayName: member.displayName,
                userTag: member.user.tag,
                guildName: guild.name
            }
        );

        const tempChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildVoice,
            parent: parentId,
            userLimit:
                userLimit === 0
                    ? undefined
                    : userLimit,
            bitrate: bitrate || 64000,

            permissionOverwrites: [
                {
                    id: member.id,
                    allow: [
                        PermissionFlagsBits.Connect,
                        PermissionFlagsBits.Speak,
                        PermissionFlagsBits.PrioritySpeaker,
                        PermissionFlagsBits.MoveMembers
                    ]
                },
                {
                    id: guild.id,
                    allow: [
                        PermissionFlagsBits.Connect,
                        PermissionFlagsBits.Speak
                    ]
                }
            ]
        });

        logger.info(
            `Salon vocal temporaire ${tempChannel.name} (${tempChannel.id}) créé pour l’utilisateur ${member.user.tag}`
        );

        return {
            id: tempChannel.id,
            name: tempChannel.name,
            ownerId: member.id
        };

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }

        throw new TitanBotError(
            `Impossible de créer le salon temporaire : ${error.message}`,
            ErrorTypes.DISCORD_API,
            'Impossible de créer votre salon vocal temporaire. Veuillez contacter un administrateur.'
        );
    }
}

export default {
    validateChannelNameTemplate,
    validateBitrate,
    validateUserLimit,
    formatChannelName,
    initializeJoinToCreate,
    updateChannelConfig,
    removeTriggerChannel,
    getConfiguration,
    isTriggerChannel,
    getChannelConfiguration,
    hasManageGuildPermission,
    logConfigurationChange,
    createTemporaryChannel
};


import { logger } from '../utils/logger.js';
import { getReactionRoleKey } from '../utils/database/keys.js';
import { getGuildConfig, setGuildConfig, patchGuildConfig } from './config/guildConfig.js';
import {
    getTicketPanelStatus,
    getVerificationPanelStatus,
    getReactionRolePanelStatus,
} from '../utils/panelStatus.js';
import { getAllReactionRoleMessages } from './reactionRoleService.js';

async function persistVerificationMessageId(client, guildId, config, messageId) {
    if (!messageId || config.verification?.messageId === messageId) return;

    await patchGuildConfig(client, guildId, {
        verification: {
            ...config.verification,
            messageId,
        },
    });
}

async function persistReactionRoleMessageId(client, guildId, panelData, messageId) {
    if (!messageId || panelData.messageId === messageId) return;

    const oldKey = getReactionRoleKey(
        guildId,
        panelData.messageId
    );

    panelData.messageId = messageId;

    const newKey = getReactionRoleKey(
        guildId,
        messageId
    );

    await client.db.set(
        newKey,
        panelData
    );

    await client.db.delete(oldKey).catch(() => {});
}

export async function reconcileTicketPanels(client) {
    const summary = {
        scannedGuilds: 0,
        healthyPanels: 0,
        deletedPanels: 0,
        missingChannels: 0,
        recoveredIds: 0,
        errors: 0,
    };

    for (const guild of client.guilds.cache.values()) {
        summary.scannedGuilds += 1;

        try {
            const config = await getGuildConfig(
                client,
                guild.id
            );

            if (!config?.ticketPanelChannelId) continue;

            const panelStatus = await getTicketPanelStatus(
                client,
                guild,
                config
            );

            if (panelStatus.recoveredId) {
                summary.recoveredIds += 1;

                config.ticketPanelMessageId =
                    panelStatus.recoveredId;

                await setGuildConfig(
                    client,
                    guild.id,
                    config
                );
            }

            if (panelStatus.exists) {
                summary.healthyPanels += 1;

            } else if (
                panelStatus.reason === 'channel_missing'
            ) {
                summary.missingChannels += 1;

                logger.warn(
                    `Canal du panneau de tickets introuvable pour le serveur ${guild.id} (${guild.name})`
                );

            } else if (
                panelStatus.reason === 'panel_deleted'
            ) {
                summary.deletedPanels += 1;

                logger.warn(
                    `Message du panneau de tickets supprimé pour le serveur ${guild.id} (${guild.name}) — les administrateurs peuvent le republier depuis /ticket dashboard`
                );
            }

        } catch (error) {
            summary.errors += 1;

            logger.warn(
                `La vérification du panneau de tickets a échoué pour le serveur ${guild.id} :`,
                error.message
            );
        }
    }

    return summary;
}

export async function reconcileVerificationPanels(client) {
    const summary = {
        scannedGuilds: 0,
        healthyPanels: 0,
        deletedPanels: 0,
        missingChannels: 0,
        recoveredIds: 0,
        errors: 0,
    };

    for (const guild of client.guilds.cache.values()) {
        summary.scannedGuilds += 1;

        try {
            const config = await getGuildConfig(
                client,
                guild.id
            );

            const verification = config?.verification;

            if (
                !verification?.channelId ||
                verification.enabled === false
            ) {
                continue;
            }

            const panelStatus =
                await getVerificationPanelStatus(
                    client,
                    guild,
                    verification
                );

            if (panelStatus.recoveredId) {
                summary.recoveredIds += 1;

                await persistVerificationMessageId(
                    client,
                    guild.id,
                    config,
                    panelStatus.recoveredId
                );
            }

            if (panelStatus.exists) {
                summary.healthyPanels += 1;

            } else if (
                panelStatus.reason === 'channel_missing'
            ) {
                summary.missingChannels += 1;

                logger.warn(
                    `Canal du panneau de vérification introuvable pour le serveur ${guild.id} (${guild.name})`
                );

            } else if (
                panelStatus.reason === 'panel_deleted'
            ) {
                summary.deletedPanels += 1;

                logger.warn(
                    `Panneau de vérification supprimé pour le serveur ${guild.id} (${guild.name}) — republiez-le depuis /verification dashboard`
                );
            }

        } catch (error) {
            summary.errors += 1;

            logger.warn(
                `La vérification du panneau de vérification a échoué pour le serveur ${guild.id} :`,
                error.message
            );
        }
    }

    return summary;
}

export async function reconcileReactionRolePanelHealth(client) {
    const summary = {
        scannedGuilds: 0,
        scannedPanels: 0,
        healthyPanels: 0,
        deletedPanels: 0,
        missingChannels: 0,
        recoveredIds: 0,
        errors: 0,
    };

    for (const guild of client.guilds.cache.values()) {
        summary.scannedGuilds += 1;

        try {
            const panels = await getAllReactionRoleMessages(
                client,
                guild.id
            );

            if (!panels?.length) continue;

            for (const panelData of panels) {
                if (
                    !panelData?.channelId ||
                    !panelData?.messageId
                ) {
                    continue;
                }

                summary.scannedPanels += 1;

                const panelStatus =
                    await getReactionRolePanelStatus(
                        client,
                        guild,
                        panelData
                    );

                if (panelStatus.recoveredId) {
                    summary.recoveredIds += 1;

                    await persistReactionRoleMessageId(
                        client,
                        guild.id,
                        panelData,
                        panelStatus.recoveredId
                    );
                }

                if (panelStatus.exists) {
                    summary.healthyPanels += 1;

                } else if (
                    panelStatus.reason === 'channel_missing'
                ) {
                    summary.missingChannels += 1;

                    logger.warn(
                        `Canal du panneau des rôles réaction introuvable pour le serveur ${guild.id}, message ${panelData.messageId}`
                    );

                } else if (
                    panelStatus.reason === 'panel_deleted'
                ) {
                    summary.deletedPanels += 1;

                    logger.warn(
                        `Panneau des rôles réaction supprimé pour le serveur ${guild.id} — republiez-le depuis /reactroles dashboard`
                    );
                }
            }

        } catch (error) {
            summary.errors += 1;

            logger.warn(
                `La vérification du panneau des rôles réaction a échoué pour le serveur ${guild.id} :`,
                error.message
            );
        }
    }

    return summary;
}

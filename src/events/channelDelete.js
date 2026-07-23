import { 
    getJoinToCreateConfig, 
    removeJoinToCreateTrigger,
    unregisterTemporaryChannel,
    getTicketData,
    saveTicketData
} from '../utils/database.js';

import {
    getServerCounters,
    saveServerCounters
} from '../services/serverstatsService.js';

import { logger } from '../utils/logger.js';

export default {
    name: 'channelDelete',

    async execute(channel, client) {
        
        // Vérifier si le salon supprimé est un salon texte appartenant à un serveur.
        if (channel.type === 0 && channel.guild) {
            try {
                const ticketData = await getTicketData(
                    channel.guild.id,
                    channel.id
                );

                if (
                    ticketData &&
                    ticketData.status === 'open'
                ) {
                    ticketData.status = 'deleted';
                    ticketData.closedAt = new Date().toISOString();

                    await saveTicketData(
                        channel.guild.id,
                        channel.id,
                        ticketData
                    );

                    logger.info(
                        `Le salon ticket ${channel.id} a été supprimé manuellement sur le serveur ${channel.guild.id} et a été marqué comme supprimé.`
                    );
                }
            } catch (err) {
                logger.warn(
                    `Impossible de nettoyer les données du ticket pour le salon supprimé ${channel.id} :`,
                    err
                );
            }
        }

        // Ignorer les salons qui ne sont ni vocaux ni des catégories.
        if (channel.type !== 2 && channel.type !== 4) {
            return;
        }

        const guildId = channel.guild.id;

        try {
            
            // Récupérer les compteurs du serveur.
            const counters = await getServerCounters(
                client,
                guildId
            );

            const orphanedCounter = counters.find(
                c => c.channelId === channel.id
            );
            
            if (orphanedCounter) {
                logger.info(
                    `Le salon compteur ${channel.name} (${channel.id}) a été supprimé. Suppression du compteur ${orphanedCounter.id} de la base de données.`
                );
                
                const updatedCounters = counters.filter(
                    c => c.channelId !== channel.id
                );

                const success = await saveServerCounters(
                    client,
                    guildId,
                    updatedCounters
                );
                
                if (success) {
                    logger.info(
                        `Le compteur orphelin ${orphanedCounter.id} (type : ${orphanedCounter.type}) a été supprimé avec succès du serveur ${guildId}.`
                    );
                } else {
                    logger.warn(
                        `Impossible de supprimer le compteur orphelin ${orphanedCounter.id} du serveur ${guildId}.`
                    );
                }
            }

            // Récupérer la configuration Join to Create.
            const config = await getJoinToCreateConfig(
                client,
                guildId
            );

            if (!config.enabled) {
                return;
            }

            // Vérifier si le salon supprimé était un salon déclencheur Join to Create.
            if (config.triggerChannels.includes(channel.id)) {
                logger.info(
                    `Le salon déclencheur Join to Create ${channel.name} (${channel.id}) a été supprimé. Suppression de la configuration.`
                );
                
                const success = await removeJoinToCreateTrigger(
                    client,
                    guildId,
                    channel.id
                );

                if (success) {
                    logger.info(
                        `Le salon déclencheur ${channel.id} a été supprimé avec succès de la configuration Join to Create.`
                    );
                } else {
                    logger.warn(
                        `Impossible de supprimer le salon déclencheur ${channel.id} de la configuration Join to Create.`
                    );
                }
            }

            // Vérifier si le salon supprimé était un salon temporaire.
            if (config.temporaryChannels[channel.id]) {
                logger.info(
                    `Le salon temporaire Join to Create ${channel.name} (${channel.id}) a été supprimé. Nettoyage de la base de données.`
                );
                
                const success = await unregisterTemporaryChannel(
                    client,
                    guildId,
                    channel.id
                );

                if (success) {
                    logger.info(
                        `Le salon temporaire ${channel.id} a été supprimé avec succès de la base de données.`
                    );
                } else {
                    logger.warn(
                        `Impossible de supprimer le salon temporaire ${channel.id} de la base de données.`
                    );
                }
            }

            // Vérifier si la catégorie utilisée par Join to Create a été supprimée.
            if (config.categoryId === channel.id) {
                logger.warn(
                    `La catégorie ${channel.name} (${channel.id}) utilisée pour les salons temporaires Join to Create a été supprimée. Join to Create sera désactivé.`
                );
                
                config.categoryId = null;
                config.enabled = false;
                
                try {
                    await client.db.set(
                        `guild:${guildId}:jointocreate`,
                        config
                    );

                    logger.info(
                        `Join to Create a été désactivé pour le serveur ${guildId} en raison de la suppression de la catégorie.`
                    );
                } catch (error) {
                    logger.error(
                        `Impossible de désactiver Join to Create pour le serveur ${guildId} :`,
                        error
                    );
                }
            }

        } catch (error) {
            logger.error(
                `Erreur lors de l'événement channelDelete pour le serveur ${guildId} :`,
                error
            );
        }
    }
};

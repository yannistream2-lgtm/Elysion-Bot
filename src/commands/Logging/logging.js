import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import dashboard from './modules/logging_dashboard.js';
import channel from './modules/logging_channel.js';

import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('logging')
        .setDescription('Gérer les journaux du serveur — salons, filtres et catégories d’événements.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)

        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('Ouvrir le tableau de bord des journaux — configurer les salons, filtres et catégories.')
        )

        .addSubcommand((subcommand) =>
            subcommand
                .setName('channel')
                .setDescription('Définir rapidement un salon de logs sans ouvrir le tableau de bord.')

                .addStringOption((option) =>
                    option
                        .setName('destination')
                        .setDescription('Choisissez la destination des journaux à configurer.')
                        .setRequired(true)
                        .addChoices(
                            {
                                name: 'Audit (modération, messages, membres…)',
                                value: 'audit'
                            },
                            {
                                name: 'Candidatures',
                                value: 'applications'
                            },
                            {
                                name: 'Signalements',
                                value: 'reports'
                            },
                        ),
                )

                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('Le salon textuel dans lequel les journaux seront envoyés.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false),
                )

                .addBooleanOption((option) =>
                    option
                        .setName('disable')
                        .setDescription('Définir sur Vrai pour supprimer le salon de journaux configuré.')
                        .setRequired(false),
                ),
        ),

    async execute(interaction, config, client) {
        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'dashboard') {
                return await dashboard.execute(interaction, config, client);
            }

            if (subcommand === 'channel') {
                return await channel.execute(interaction, config, client);
            }

            await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Cette sous-commande n’est pas reconnue.',
            });

        } catch (error) {
            logger.error('Erreur lors de l’exécution de la commande logging :', error);

            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message: 'Une erreur inattendue s’est produite.',
            }).catch(() => {});
        }
    },
};

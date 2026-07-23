import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import report from './modules/report.js';
import reportSetchannel from './modules/report_setchannel.js';

export default {
    data: new SlashCommandBuilder()
        .setName('report')
        .setDescription('Signaler un utilisateur au staff du serveur ou configurer le salon des signalements.')
        .setDMPermission(false)

        .addSubcommand(subcommand =>
            subcommand
                .setName('file')
                .setDescription('Signaler un utilisateur à l\'équipe de modération du serveur.')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('L\'utilisateur que vous souhaitez signaler.')
                        .setRequired(true),
                )
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('La raison du signalement (soyez précis).')
                        .setRequired(true)
                        .setMaxLength(500),
                ),
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('setchannel')
                .setDescription('Définir le salon où les signalements seront envoyés. (Permission Gérer le serveur requise)')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Le salon textuel qui recevra les signalements.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                ),
        ),

    category: 'Utilitaire',

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'file') {
            return await report.execute(interaction, config, client);
        }

        if (subcommand === 'setchannel') {
            return await reportSetchannel.execute(interaction, config, client);
        }

        return await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: 'Sous-commande inconnue.'
        });
    },
};

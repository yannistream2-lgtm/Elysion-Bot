import { SlashCommandBuilder } from 'discord.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import searchDefine from './modules/search_define.js';
import searchGoogle from './modules/search_google.js';
import searchUrban from './modules/search_urban.js';

export default {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Rechercher sur le Web et dans des dictionnaires')

        .addSubcommand(subcommand =>
            subcommand
                .setName('define')
                .setDescription('Rechercher la définition d’un mot')
                .addStringOption(option =>
                    option
                        .setName('word')
                        .setDescription('Le mot dont vous souhaitez connaître la définition')
                        .setRequired(true)
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('google')
                .setDescription('Effectuer une recherche sur Google')
                .addStringOption(option =>
                    option
                        .setName('query')
                        .setDescription('Que souhaitez-vous rechercher ?')
                        .setRequired(true)
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName('urban')
                .setDescription('Rechercher une définition sur Urban Dictionary')
                .addStringOption(option =>
                    option
                        .setName('term')
                        .setDescription('Le terme à rechercher sur Urban Dictionary')
                        .setRequired(true)
                )
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'define':
                return await searchDefine.execute(interaction, config, client);

            case 'google':
                return await searchGoogle.execute(interaction, config, client);

            case 'urban':
                return await searchUrban.execute(interaction, config, client);

            default:
                return await replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: 'Sous-commande inconnue.',
                });
        }
    },
};

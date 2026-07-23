import { getColor } from '../../config/bot.js';
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    ChannelType
} from 'discord.js';

import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { handleCreate } from './modules/serverstats_create.js';
import { handleList } from './modules/serverstats_list.js';
import { handleUpdate } from './modules/serverstats_update.js';
import { handleDelete } from './modules/serverstats_delete.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    replyUserError,
    ErrorTypes
} from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("serverstats")
        .setDescription(
            "Gérer les statistiques du serveur, comme le nombre de membres et les données des salons"
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)

        // ─────────────────────────────────────────────
        // CRÉER
        // ─────────────────────────────────────────────
        .addSubcommand(subcommand =>
            subcommand
                .setName("create")
                .setDescription(
                    "Créer un nouveau compteur de statistiques dans une catégorie"
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription(
                            "Choisir le type de statistiques à suivre"
                        )
                        .setRequired(true)
                        .addChoices(
                            {
                                name: "Membres + bots",
                                value: "members"
                            },
                            {
                                name: "Membres uniquement",
                                value: "members_only"
                            },
                            {
                                name: "Bots uniquement",
                                value: "bots"
                            }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName("channel_type")
                        .setDescription(
                            "Choisir le type de salon à créer pour ce compteur"
                        )
                        .setRequired(true)
                        .addChoices(
                            {
                                name: "Salon vocal (recommandé)",
                                value: "voice"
                            },
                            {
                                name: "Salon textuel",
                                value: "text"
                            }
                        )
                )
                .addChannelOption(option =>
                    option
                        .setName("category")
                        .setDescription(
                            "Choisir la catégorie où le salon de statistiques sera créé"
                        )
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildCategory)
                )
        )

        // ─────────────────────────────────────────────
        // LISTE
        // ─────────────────────────────────────────────
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription(
                    "Afficher tous les compteurs de statistiques de ce serveur"
                )
        )

        // ─────────────────────────────────────────────
        // MODIFIER
        // ─────────────────────────────────────────────
        .addSubcommand(subcommand =>
            subcommand
                .setName("update")
                .setDescription(
                    "Modifier un compteur de statistiques existant"
                )
                .addStringOption(option =>
                    option
                        .setName("counter-id")
                        .setDescription(
                            "Identifiant du compteur à modifier"
                        )
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription(
                            "Nouveau type de statistiques à suivre"
                        )
                        .setRequired(false)
                        .addChoices(
                            {
                                name: "Membres + bots",
                                value: "members"
                            },
                            {
                                name: "Membres uniquement",
                                value: "members_only"
                            },
                            {
                                name: "Bots uniquement",
                                value: "bots"
                            }
                        )
                )
        )

        // ─────────────────────────────────────────────
        // SUPPRIMER
        // ─────────────────────────────────────────────
        .addSubcommand(subcommand =>
            subcommand
                .setName("delete")
                .setDescription(
                    "Supprimer un compteur de statistiques existant"
                )
                .addStringOption(option =>
                    option
                        .setName("counter-id")
                        .setDescription(
                            "Identifiant du compteur à supprimer"
                        )
                        .setRequired(true)
                )
        ),

    async execute(interaction, guildConfig, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case "create":
                await handleCreate(interaction, client);
                break;

            case "list":
                await handleList(interaction, client);
                break;

            case "update":
                await handleUpdate(interaction, client);
                break;

            case "delete":
                await handleDelete(interaction, client);
                break;

            default:
                await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: "Sous-commande inconnue."
                });
        }
    }
};

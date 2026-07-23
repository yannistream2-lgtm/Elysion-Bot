import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, infoEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import {
    getFromDb,
    setInDb,
    getUserNotesKey,
} from '../../utils/database.js';
import { sanitizeInput } from '../../utils/validation.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("usernotes")
        .setDescription("Gérer les notes des utilisateurs à des fins de modération")

        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Ajouter une note à un utilisateur")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("L'utilisateur auquel ajouter une note")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("note")
                        .setDescription("La note à ajouter")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("Type de note")
                        .addChoices(
                            { name: "Avertissement", value: "warning" },
                            { name: "Positif", value: "positive" },
                            { name: "Neutre", value: "neutral" },
                            { name: "Alerte", value: "alert" }
                        )
                        .setRequired(false)
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("view")
                .setDescription("Voir les notes d'un utilisateur")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("L'utilisateur dont vous souhaitez voir les notes")
                        .setRequired(true)
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Supprimer une note spécifique d'un utilisateur")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("L'utilisateur dont vous souhaitez supprimer une note")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("index")
                        .setDescription("Le numéro de la note à supprimer")
                        .setRequired(true)
                        .setMinValue(1)
                )
        )

        .addSubcommand(subcommand =>
            subcommand
                .setName("clear")
                .setDescription("Supprimer toutes les notes d'un utilisateur")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("L'utilisateur dont vous souhaitez supprimer les notes")
                        .setRequired(true)
                )
        )

        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    category: "moderation",

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser("target");
        const guildId = interaction.guild.id;

        if (!["view", "remove", "clear", "add"].includes(subcommand)) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: "Veuillez sélectionner une sous-commande valide.",
            });
        }

        let notes = [];

        if (targetUser) {
            const notesKey = getUserNotesKey(guildId, targetUser.id);
            notes = await getFromDb(notesKey, []);
        }

        try {
            switch (subcommand) {
                case "add":
                    return await handleAddNote(
                        interaction,
                        targetUser,
                        notes,
                        guildId
                    );

                case "view":
                    return await handleViewNotes(
                        interaction,
                        targetUser,
                        notes
                    );

                case "remove":
                    return await handleRemoveNote(
                        interaction,
                        targetUser,
                        notes,
                        guildId
                    );

                case "clear":
                    return await handleClearNotes(
                        interaction,
                        targetUser,
                        notes,
                        guildId
                    );

                default:
                    return await replyUserError(interaction, {
                        type: ErrorTypes.VALIDATION,
                        message: "Veuillez sélectionner une sous-commande valide.",
                    });
            }
        } catch (error) {
            logger.error(
                `Erreur dans la commande usernotes (${subcommand}) :`,
                error
            );

            return await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message:
                    "Une erreur est survenue lors du traitement de votre demande. Veuillez réessayer plus tard.",
            });
        }
    },
};

async function handleAddNote(
    interaction,
    targetUser,
    notes,
    guildId
) {
    let note = interaction.options
        .getString("note")
        .trim();

    const type =
        interaction.options.getString("type") || "neutral";

    if (note.length > 1000) {
        return await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message:
                "Les notes doivent contenir au maximum 1000 caractères.",
        });
    }

    if (note.length === 0) {
        return await replyUserError(interaction, {
            type: ErrorTypes.UNKNOWN,
            message: "La note ne peut pas être vide.",
        });
    }

    note = sanitizeInput(note);

    const noteData = {
        id: Date.now(),
        content: note,
        type: type,
        author: interaction.user.tag,
        authorId: interaction.user.id,
        timestamp: new Date().toISOString(),
    };

    notes.push(noteData);

    const notesKey = getUserNotesKey(
        guildId,
        targetUser.id
    );

    await setInDb(notesKey, notes);

    const typeInfo = getNoteTypeInfo(type);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                `${typeInfo.emoji} Note ajoutée`,
                `Une note **${getNoteTypeName(type)}** a été ajoutée pour **${targetUser.tag}** :\n\n` +
                `> ${note}\n\n` +
                `**Modérateur :** ${interaction.user.tag}\n` +
                `**Nombre total de notes :** ${notes.length}`
            ),
        ],
    });
}

async function handleViewNotes(
    interaction,
    targetUser,
    notes
) {
    if (notes.length === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                infoEmbed(
                    "📝 Aucune note",
                    `Aucune note n'a été enregistrée pour **${targetUser.tag}**.`
                ),
            ],
        });
    }

    const sortedNotes = [...notes].sort(
        (a, b) =>
            new Date(b.timestamp) -
            new Date(a.timestamp)
    );

    let description =
        `**Notes de ${targetUser.tag} (${targetUser.id}) :**\n\n`;

    sortedNotes.forEach((note, index) => {
        const typeInfo = getNoteTypeInfo(note.type);

        const date = new Date(
            note.timestamp
        ).toLocaleDateString("fr-FR");

        description +=
            `${typeInfo.emoji} **Note n°${index + 1}** (${getNoteTypeName(note.type)}) - ${date}\n`;

        description +=
            `> ${note.content}\n`;

        description +=
            `*Ajoutée par ${note.author}*\n\n`;
    });

    if (description.length > 4000) {
        description =
            description.substring(0, 3900) +
            "\n... *(texte tronqué)*";
    }

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            infoEmbed(
                `📝 Notes utilisateur (${notes.length})`,
                description
            ),
        ],
    });
}

async function handleRemoveNote(
    interaction,
    targetUser,
    notes,
    guildId
) {
    const index =
        interaction.options.getInteger("index") - 1;

    if (
        index < 0 ||
        index >= notes.length
    ) {
        return await replyUserError(interaction, {
            type: ErrorTypes.VALIDATION,
            message:
                `Veuillez fournir un numéro de note valide (1-${notes.length}).`,
        });
    }

    // La commande "view" affiche les notes de la plus récente
    // à la plus ancienne. On utilise donc le même ordre
    // pour supprimer la bonne note.
    const sortedNotes = [...notes].sort(
        (a, b) =>
            new Date(b.timestamp) -
            new Date(a.timestamp)
    );

    const removedNote = sortedNotes[index];

    const originalIndex =
        notes.indexOf(removedNote);

    notes.splice(originalIndex, 1);

    const notesKey = getUserNotesKey(
        guildId,
        targetUser.id
    );

    await setInDb(notesKey, notes);

    const typeInfo =
        getNoteTypeInfo(removedNote.type);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                `${typeInfo.emoji} Note supprimée`,
                `La note n°${index + 1} de **${targetUser.tag}** a été supprimée :\n\n` +
                `> ${removedNote.content}\n\n` +
                `**Notes restantes :** ${notes.length}`
            ),
        ],
    });
}

async function handleClearNotes(
    interaction,
    targetUser,
    notes,
    guildId
) {
    const noteCount = notes.length;

    if (noteCount === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                infoEmbed(
                    "Aucune note à supprimer",
                    `Aucune note n'est enregistrée pour **${targetUser.tag}**.`
                ),
            ],
        });
    }

    notes.length = 0;

    const notesKey = getUserNotesKey(
        guildId,
        targetUser.id
    );

    await setInDb(notesKey, notes);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                "🗑️ Notes supprimées",
                `**${noteCount}** note(s) ont été supprimées pour **${targetUser.tag}**.`
            ),
        ],
    });
}

function getNoteTypeInfo(type) {
    const types = {
        warning: {
            emoji: "⚠️",
            color: "#FF6B6B",
        },

        positive: {
            emoji: "✅",
            color: "#51CF66",
        },

        neutral: {
            emoji: "📝",
            color: "#74C0FC",
        },

        alert: {
            emoji: "🚨",
            color: "#FFD43B",
        },
    };

    return types[type] || types.neutral;
}

function getNoteTypeName(type) {
    const names = {
        warning: "avertissement",
        positive: "positive",
        neutral: "neutre",
        alert: "alerte",
    };

    return names[type] || names.neutral;
}

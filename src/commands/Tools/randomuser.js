import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('randomuser')
        .setDescription('Sélectionner un utilisateur aléatoire du serveur')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Limiter la sélection aux utilisateurs ayant ce rôle')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('bots')
                .setDescription('Inclure les bots dans la sélection (par défaut : faux)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('online')
                .setDescription('Sélectionner uniquement les utilisateurs en ligne (par défaut : faux)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('mention')
                .setDescription('Mentionner l’utilisateur sélectionné (par défaut : faux)')
                .setRequired(false)),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn(`Échec du report de l'interaction RandomUser`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'randomuser'
            });
            return;
        }

        if (!interaction.guild) {
            return replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Cette commande peut uniquement être utilisée sur un serveur.',
            });
        }

        const role = interaction.options.getRole('role');
        const includeBots = interaction.options.getBoolean('bots') || false;
        const onlineOnly = interaction.options.getBoolean('online') || false;
        const shouldMention = interaction.options.getBoolean('mention') || false;

        let members = interaction.guild.members.cache.filter(member => {
            if (member.user.bot && !includeBots) return false;

            if (onlineOnly && member.presence?.status === 'offline') return false;

            if (role && !member.roles.cache.has(role.id)) return false;

            return true;
        });

        let memberArray = Array.from(members.values());

        if (!includeBots) {
            memberArray = memberArray.filter(member => !member.user.bot);
        }

        if (memberArray.length === 0) {
            let errorMessage = 'Aucun utilisateur correspondant à vos filtres n’a été trouvé :';

            if (role) {
                errorMessage = `Aucun utilisateur ne possède le rôle **${role.name}**.`;
            }

            if (onlineOnly) {
                errorMessage = 'Aucun utilisateur n’est actuellement en ligne.';
            }

            if (role && onlineOnly) {
                errorMessage = `Aucun membre possédant le rôle **${role.name}** n’est actuellement en ligne.`;
            }

            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: errorMessage + '\n\nEssayez de modifier vos filtres.',
            });
        }

        const randomIndex = Math.floor(Math.random() * memberArray.length);
        const selectedMember = memberArray[randomIndex];

        const user = selectedMember.user;
        const joinDate = selectedMember.joinedAt;

        const roles = selectedMember.roles.cache
            .filter(role => role.id !== interaction.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(role => role.toString())
            .slice(0, 10);

        const embed = successEmbed(
            '🎲 Utilisateur sélectionné aléatoirement',
            shouldMention ? `${selectedMember}` : `**${user.username}**`
        )
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
            {
                name: 'Nom d’utilisateur',
                value: user.username,
                inline: true
            },
            {
                name: 'Bot',
                value: user.bot ? 'Oui' : 'Non',
                inline: true
            },
            {
                name: `Rôles (${roles.length})`,
                value: roles.length > 0
                    ? roles.slice(0, 5).join('') + (roles.length > 5 ? `+${roles.length - 5} autres` : '')
                    : 'Aucun rôle',
                inline: false
            }
        )
        .setColor('primary');

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`randomuser_${interaction.user.id}_again`)
                    .setLabel('🎲 Sélectionner un autre utilisateur')
                    .setStyle(ButtonStyle.Primary)
            );

        const response = await interaction.editReply({
            content: shouldMention ? `${selectedMember}, vous avez été sélectionné !` : null,
            embeds: [embed],
            components: [row],
            allowedMentions: {
                users: shouldMention ? [user.id] : []
            }
        });

        const filter = (i) =>
            i.customId === `randomuser_${interaction.user.id}_again` &&
            i.user.id === interaction.user.id;

        const collector = response.createMessageComponentCollector({
            filter,
            time: 300000
        });

        collector.on('collect', async (i) => {
            try {
                let newMembers = interaction.guild.members.cache.filter(member => {
                    if (member.user.bot && !includeBots) return false;

                    if (onlineOnly && member.presence?.status === 'offline') return false;

                    if (role && !member.roles.cache.has(role.id)) return false;

                    return true;
                });

                let newMemberArray = Array.from(newMembers.values());

                if (!includeBots) {
                    newMemberArray = newMemberArray.filter(member => !member.user.bot);
                }

                if (newMemberArray.length === 0) {
                    await replyUserError(i, {
                        type: ErrorTypes.USER_INPUT,
                        message: 'Aucun utilisateur correspondant aux critères n’a été trouvé.',
                    });
                    return;
                }

                const newRandomIndex = Math.floor(Math.random() * newMemberArray.length);
                const newSelectedMember = newMemberArray[newRandomIndex];
                const newUser = newSelectedMember.user;

                const newRoles = newSelectedMember.roles.cache
                    .filter(r => r.id !== interaction.guild.id)
                    .sort((a, b) => b.position - a.position)
                    .map(r => r.toString())
                    .slice(0, 10);

                const newEmbed = successEmbed(
                    '🎲 Utilisateur sélectionné aléatoirement',
                    shouldMention
                        ? `${newSelectedMember}`
                        : `**${newUser.username}**`
                )
                .setThumbnail(
                    newUser.displayAvatarURL({
                        dynamic: true,
                        size: 256
                    })
                )
                .addFields(
                    {
                        name: 'Nom d’utilisateur',
                        value: newUser.username,
                        inline: true
                    },
                    {
                        name: 'Bot',
                        value: newUser.bot ? 'Oui' : 'Non',
                        inline: true
                    },
                    {
                        name: `Rôles (${newRoles.length})`,
                        value: newRoles.length > 0
                            ? newRoles.slice(0, 5).join('') +
                              (newRoles.length > 5
                                  ? `+${newRoles.length - 5} autres`
                                  : '')
                            : 'Aucun rôle',
                        inline: false
                    }
                )
                .setColor(
                    newSelectedMember.displayHexColor || '#3498db'
                );

                await i.update({
                    content: shouldMention
                        ? `${newSelectedMember}, vous avez été sélectionné !`
                        : null,
                    embeds: [newEmbed],
                    components: [row],
                    allowedMentions: {
                        users: shouldMention ? [newUser.id] : []
                    }
                });

            } catch (error) {
                logger.error(
                    'Erreur lors de l’interaction avec le bouton :',
                    error
                );

                await i.reply({
                    content: 'Une erreur est survenue lors de la sélection d’un autre utilisateur.',
                    flags: ['Ephemeral']
                });
            }
        });

        collector.on('end', () => {
            const disabledRow = ActionRowBuilder.from(row).setComponents(
                ButtonBuilder.from(row.components[0])
                    .setDisabled(true)
            );

            interaction.editReply({
                components: [disabledRow]
            }).catch(console.error);
        });
    },
};

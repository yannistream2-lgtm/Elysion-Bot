
import {
  PermissionFlagsBits,
  ChannelSelectMenuBuilder,
  ChannelType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import {
  toggleEventLogging,
  getLoggingStatus,
  EVENT_TYPES,
  setLoggingEnabled,
  setLogChannel,
  updateIgnoreList,
  getIgnoreList,
} from '../services/loggingService.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { successEmbed } from '../utils/embeds.js';
import { replyUserError, ErrorTypes, handleInteractionError } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import {
  buildLoggingDashboardView,
  buildLoggingCategoriesView,
  buildLoggingFilterView,
  isCategoriesView,
  isFilterView,
  refreshDashboardMessage,
} from '../commands/Logging/modules/logging_dashboard.js';

const LOGGING_CATEGORIES = [...new Set(Object.values(EVENT_TYPES).map((eventType) => eventType.split('.')[0]))];

const DESTINATION_LABELS = {
  audit: 'Journal d’audit',
  applications: 'Applications',
  reports: 'Rapports',
};

export default {
  customIds: [
    'log_dash_toggle',
    'log_dash_refresh',
    'log_dash_back',
    'log_dash_add_filter',
    'log_dash_remove_filter',
  ],

  async execute(interaction) {
    try {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          content: '❌ Vous avez besoin de la permission **Gérer le serveur** pour utiliser ceci.',
          ephemeral: true,
        });
      }

      if (interaction.customId === 'log_dash_refresh') {
        return handleRefresh(interaction);
      }

      if (interaction.customId === 'log_dash_back') {
        return handleBackToMain(interaction);
      }

      if (interaction.customId === 'log_dash_remove_filter') {
        return handleRemoveFilterModal(interaction);
      }

      if (interaction.customId.startsWith('log_dash_add_filter:')) {
        return handleAddFilterModal(interaction);
      }

      if (interaction.customId.startsWith('log_dash_toggle')) {
        return handleToggle(interaction);
      }
    } catch (error) {
      await handleInteractionError(interaction, error, {
        type: 'button',
        customId: interaction.customId,
        handler: 'logging',
      });
    }
  },
};

async function handleRefresh(interaction) {
  if (isCategoriesView(interaction)) {
    const { embed, components } = await buildLoggingCategoriesView(interaction, interaction.client);
    return interaction.update({ embeds: [embed], components, content: null });
  }

  if (isFilterView(interaction)) {
    const { embed, components } = await buildLoggingFilterView(interaction, interaction.client);
    return interaction.update({ embeds: [embed], components, content: null });
  }

  const { embed, components } = await buildLoggingDashboardView(interaction, interaction.client);
  await interaction.update({ embeds: [embed], components, content: null });
}

async function handleBackToMain(interaction) {
  const { embed, components } = await buildLoggingDashboardView(interaction, interaction.client);
  await interaction.update({ embeds: [embed], components, content: null });
}

async function handleToggle(interaction) {
  const eventType = interaction.customId.replace('log_dash_toggle:', '');
  if (!eventType) {
    return interaction.reply({ content: '❌ Type d’événement invalide.', ephemeral: true });
  }

  const status = await getLoggingStatus(interaction.client, interaction.guildId);
  const onCategoriesView = isCategoriesView(interaction);

  if (eventType === 'audit_enabled') {
    await setLoggingEnabled(interaction.client, interaction.guildId, !Boolean(status.enabled));
  } else if (eventType === 'all') {
    const newState = !Object.values(status.enabledEvents).every((v) => v !== false);
    const allTypes = Object.values(EVENT_TYPES);
    const categoryTypes = LOGGING_CATEGORIES.map((c) => `${c}.*`);
    await toggleEventLogging(interaction.client, interaction.guildId, [...allTypes, ...categoryTypes], newState);
  } else {
    const currentState = status.enabledEvents[eventType] !== false;
    await toggleEventLogging(interaction.client, interaction.guildId, eventType, !currentState);
  }

  if (onCategoriesView || (eventType !== 'audit_enabled' && eventType.includes('.*'))) {
    const { embed, components } = await buildLoggingCategoriesView(interaction, interaction.client);
    return interaction.update({ embeds: [embed], components, content: null });
  }

  const { embed, components } = await buildLoggingDashboardView(interaction, interaction.client);
  await interaction.update({ embeds: [embed], components, content: null });
}

async function handleAddFilterModal(interaction) {
  const filterType = interaction.customId.replace('log_dash_add_filter:', '');
  if (filterType !== 'user' && filterType !== 'channel') {
    return interaction.reply({ content: '❌ Type de filtre invalide.', ephemeral: true });
  }

  const modalCustomId = `log_dash_filter_modal:add:${filterType}`;

  let modal;
  if (filterType === 'user') {
    const userSelect = new UserSelectMenuBuilder()
      .setCustomId('ignore_user')
      .setPlaceholder('Sélectionnez un utilisateur à ignorer…')
      .setMinValues(1)
      .setMaxValues(1);

    const userLabel = new LabelBuilder()
      .setLabel('Utilisateur à ignorer')
      .setDescription('Choisissez un utilisateur dont les actions ne seront pas enregistrées')
      .setUserSelectMenuComponent(userSelect);

    modal = new ModalBuilder()
      .setCustomId(modalCustomId)
      .setTitle('Ajouter un filtre utilisateur')
      .addLabelComponents(userLabel);
  } else {
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId('ignore_channel')
      .setPlaceholder('Sélectionnez un salon à ignorer…')
      .setMinValues(1)
      .setMaxValues(1)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice);

    const channelLabel = new LabelBuilder()
      .setLabel('Salon à ignorer')
      .setDescription('Choisissez un salon dont les événements ne seront pas enregistrés')
      .setChannelSelectMenuComponent(channelSelect);

    modal = new ModalBuilder()
      .setCustomId(modalCustomId)
      .setTitle('Ajouter un filtre de salon')
      .addLabelComponents(channelLabel);
  }

  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      time: 5 * 60 * 1000,
      filter: (i) => i.user.id === interaction.user.id && i.customId === modalCustomId,
    });

    let id;
    if (filterType === 'user') {
      id = modalSubmission.fields.getField('ignore_user')?.values?.[0];
    } else {
      id = modalSubmission.fields.getField('ignore_channel')?.values?.[0];
    }

    if (!id) {
      return replyUserError(modalSubmission, {
        type: ErrorTypes.VALIDATION,
        message: `Veuillez sélectionner ${filterType === 'user' ? 'un utilisateur' : 'un salon'} à ignorer.`,
      });
    }

    await updateIgnoreList(interaction.client, interaction.guildId, { action: 'add', type: filterType, id });

    await modalSubmission.reply({
      embeds: [
        successEmbed(
          'Filtre ajouté',
          `${filterType === 'user' ? 'L’utilisateur' : 'Le salon'} \`${id}\` sera ignoré dans les journaux d’audit.`
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });

    if (isFilterView(interaction)) {
      await refreshDashboardMessage(interaction, interaction.client);
    }
  } catch (error) {
    if (error.code === 'INTERACTION_TIMEOUT') {
      return;
    }
    logger.error('Erreur dans le modal d’ajout de filtre :', error);
  }
}

async function handleRemoveFilterModal(interaction) {
  const config = await getGuildConfig(interaction.client, interaction.guildId);
  const ignore = getIgnoreList(config);
  const options = [];

  for (const userId of ignore.users || []) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`Utilisateur ${userId}`)
        .setDescription('Supprimer cet utilisateur de la liste des utilisateurs ignorés')
        .setValue(`user:${userId}`),
    );
  }

  for (const channelId of ignore.channels || []) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`Salon ${channelId}`)
        .setDescription('Supprimer ce salon de la liste des salons ignorés')
        .setValue(`channel:${channelId}`),
    );
  }

  if (options.length === 0) {
    return replyUserError(interaction, {
      type: ErrorTypes.USER_INPUT,
      message: 'Il n’y a aucun filtre à supprimer.',
    });
  }

  const modalCustomId = 'log_dash_filter_modal:remove';

  const filterSelect = new StringSelectMenuBuilder()
    .setCustomId('filter_entry')
    .setPlaceholder('Sélectionnez un filtre à supprimer…')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options.slice(0, 25));

  const filterLabel = new LabelBuilder()
    .setLabel('Filtre à supprimer')
    .setDescription('Choisissez un utilisateur ou un salon à retirer de la liste des ignorés')
    .setStringSelectMenuComponent(filterSelect);

  const modal = new ModalBuilder()
    .setCustomId(modalCustomId)
    .setTitle('Supprimer un filtre')
    .addLabelComponents(filterLabel);

  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      time: 5 * 60 * 1000,
      filter: (i) => i.user.id === interaction.user.id && i.customId === modalCustomId,
    });

    const entry = modalSubmission.fields.getField('filter_entry')?.values?.[0];
    if (!entry) {
      return replyUserError(modalSubmission, {
        type: ErrorTypes.VALIDATION,
        message: 'Veuillez sélectionner un filtre à supprimer.',
      });
    }

    const [type, id] = entry.split(':');
    await updateIgnoreList(interaction.client, interaction.guildId, { action: 'remove', type, id });

    await modalSubmission.reply({
      embeds: [
        successEmbed(
          'Filtre supprimé',
          `${type === 'user' ? 'L’utilisateur' : 'Le salon'} \`${id}\` a été retiré de la liste des ignorés.`
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });

    if (isFilterView(interaction)) {
      await refreshDashboardMessage(interaction, interaction.client);
    }
  } catch (error) {
    if (error.code === 'INTERACTION_TIMEOUT') {
      return;
    }
    logger.error('Erreur dans le modal de suppression de filtre :', error);
  }
}

async function showChannelModal(interaction, destination) {
  const label = DESTINATION_LABELS[destination] || destination;
  const modalCustomId = `log_dash_channel_modal:${destination}`;

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('log_channel')
    .setPlaceholder('Sélectionnez un salon textuel…')
    .setMinValues(1)
    .setMaxValues(1)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setRequired(true);

  const channelLabel = new LabelBuilder()
    .setLabel(`Salon des ${label}`)
    .setDescription(`Salon où les journaux ${label.toLowerCase()} seront envoyés`)
    .setChannelSelectMenuComponent(channelSelect);

  const modal = new ModalBuilder()
    .setCustomId(modalCustomId)
    .setTitle(`Définir le salon des ${label}`)
    .addLabelComponents(channelLabel);

  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      time: 5 * 60 * 1000,
      filter: (i) => i.user.id === interaction.user.id && i.customId === modalCustomId,
    });

    const channelId = modalSubmission.fields.getField('log_channel').values[0];
    const channel = interaction.guild.channels.cache.get(channelId)
      ?? await interaction.guild.channels.fetch(channelId).catch(() => null);

    if (!channel) {
      return modalSubmission.reply({
        content: '❌ Ce salon est introuvable.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const botPerms = channel.permissionsFor(interaction.guild.members.me);
    if (!botPerms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
      return modalSubmission.reply({
        content: '❌ J’ai besoin des permissions **Voir le salon**, **Envoyer des messages** et **Intégrer des liens** dans ce salon.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await setLogChannel(interaction.client, interaction.guildId, destination, channel.id);

    await modalSubmission.reply({
      embeds: [
        successEmbed(
          'Salon mis à jour',
          `Les journaux **${label}** seront désormais envoyés dans ${channel}.`
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });

    await refreshDashboardMessage(interaction, interaction.client);
  } catch (error) {
    if (error.code === 'INTERACTION_TIMEOUT') {
      return;
    }
    await handleInteractionError(interaction, error, {
      type: 'modal',
      customId: interaction.customId,
      handler: 'logging_channel',
    });
  }
}

export async function handleLoggingMenuSelect(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: '❌ Vous avez besoin de la permission **Gérer le serveur** pour utiliser ceci.',
      ephemeral: true,
    });
  }

  const value = interaction.values[0];

  if (value.startsWith('set:')) {
    const destination = value.replace('set:', '');
    return showChannelModal(interaction, destination);
  }

  if (value.startsWith('clear:')) {
    const destination = value.replace('clear:', '');
    await setLogChannel(interaction.client, interaction.guildId, destination, null);
    const { embed, components } = await buildLoggingDashboardView(interaction, interaction.client);
    return interaction.update({
      embeds: [embed],
      components,
      content: null,
    });
  }

  if (value === 'view:categories') {
    const { embed, components } = await buildLoggingCategoriesView(interaction, interaction.client);
    return interaction.update({ embeds: [embed], components, content: null });
  }

  if (value === 'view:filters') {
    const { embed, components } = await buildLoggingFilterView(interaction, interaction.client);
    return interaction.update({ embeds: [embed], components, content: null });
  }

  return interaction.reply({ content: '❌ Option inconnue.', ephemeral: true });
}


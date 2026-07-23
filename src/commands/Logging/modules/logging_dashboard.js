import { EmbedBuilder, MessageFlags, PermissionsBitField } from 'discord.js';
import { getColor } from '../../../config/bot.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { getLoggingStatus } from '../../../services/loggingService.js';
import {
  createLoggingDashboardComponents,
  createLoggingCategoryViewComponents,
  createLoggingFilterComponents,
  DASHBOARD_CATEGORIES,
  DASHBOARD_CATEGORY_LABELS,
  EVENT_TYPES_BY_CATEGORY,
} from '../../../utils/logging/loggingUi.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';

export function getCategoryStatus(enabledEvents, category, auditEnabled) {
  if (!auditEnabled) return false;

  const events = enabledEvents || {};

  if (events[`${category}.*`] === false) return false;

  const categoryEvents = EVENT_TYPES_BY_CATEGORY[category] || [];

  if (categoryEvents.length === 0) return true;

  return categoryEvents.every((eventType) => events[eventType] !== false);
}

async function formatChannelMention(guild, id) {
  if (!id) return '`Non configuré`';

  const channel =
    guild.channels.cache.get(id) ??
    await guild.channels.fetch(id).catch(() => null);

  return channel ? channel.toString() : `⚠️ Introuvable (${id})`;
}

function countEnabledCategories(enabledEvents, auditEnabled) {
  const enabled = DASHBOARD_CATEGORIES.filter((key) =>
    getCategoryStatus(enabledEvents, key, auditEnabled),
  ).length;

  return {
    enabled,
    total: DASHBOARD_CATEGORIES.length,
  };
}

export async function buildLoggingDashboardView(interaction, client) {
  const guildConfig = await getGuildConfig(
    client,
    interaction.guildId,
  );

  const loggingStatus = await getLoggingStatus(
    client,
    interaction.guildId,
  );

  const auditEnabled = Boolean(loggingStatus.enabled);
  const channels = loggingStatus.channels || {};

  const auditChannel = await formatChannelMention(
    interaction.guild,
    channels.audit,
  );

  const applicationsChannel = await formatChannelMention(
    interaction.guild,
    channels.applications,
  );

  const reportsChannel = await formatChannelMention(
    interaction.guild,
    channels.reports,
  );

  const lifecycleChannel = await formatChannelMention(
    interaction.guild,
    guildConfig.ticketLogsChannelId,
  );

  const transcriptChannel = await formatChannelMention(
    interaction.guild,
    guildConfig.ticketTranscriptChannelId,
  );

  const ignore = loggingStatus.ignore || {
    users: [],
    channels: [],
  };

  const {
    enabled: enabledCount,
    total,
  } = countEnabledCategories(
    loggingStatus.enabledEvents,
    auditEnabled,
  );

  const embed = new EmbedBuilder()
    .setTitle('📝 Tableau de bord des logs')
    .setDescription(
      `Gérez les logs du serveur **${interaction.guild.name}**. Utilisez le menu ci-dessous pour configurer les salons, les catégories et les filtres.`,
    )
    .setColor(
      auditEnabled
        ? getColor('success')
        : getColor('warning'),
    )
    .addFields(
      {
        name: 'Statut des logs',
        value: auditEnabled
          ? '✅ Activé'
          : '❌ Désactivé',
        inline: true,
      },
      {
        name: 'Catégories d’événements',
        value: auditEnabled
          ? `${enabledCount}/${total} activées`
          : '`Logs désactivés`',
        inline: true,
      },
      {
        name: 'Filtres ignorés',
        value: `${ignore.users?.length || 0} utilisateurs · ${ignore.channels?.length || 0} salons`,
        inline: true,
      },
      {
        name: 'Salons de logs',
        value: [
          `**Audit :** ${auditChannel}`,
          `**Candidatures :** ${applicationsChannel}`,
          `**Signalements :** ${reportsChannel}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Salons des tickets (lecture seule)',
        value: [
          `**Logs des tickets :** ${lifecycleChannel}`,
          `**Transcriptions :** ${transcriptChannel}`,
        ].join('\n'),
        inline: false,
      },
    )
    .setFooter({
      text: 'Salons des tickets : configurez-les via /ticket dashboard',
    })
    .setTimestamp();

  const components = createLoggingDashboardComponents(
    loggingStatus.enabledEvents,
    auditEnabled,
  );

  return {
    embed,
    components,
  };
}

export async function buildLoggingCategoriesView(
  interaction,
  client,
) {
  const loggingStatus = await getLoggingStatus(
    client,
    interaction.guildId,
  );

  const auditEnabled = Boolean(loggingStatus.enabled);

  const categoryLines = DASHBOARD_CATEGORIES.map((key) => {
    const on = getCategoryStatus(
      loggingStatus.enabledEvents,
      key,
      auditEnabled,
    );

    const label =
      DASHBOARD_CATEGORY_LABELS[key] || key;

    return `${on ? '✅' : '❌'} ${label}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('📋 Catégories d’événements')
    .setDescription(
      auditEnabled
        ? 'Activez ou désactivez les types d’événements enregistrés dans votre salon d’audit.'
        : '⚠️ Les logs sont désactivés. Activez-les depuis le tableau de bord principal pour envoyer les logs.',
    )
    .setColor(getColor('info'))
    .addFields({
      name: 'Statut des catégories',
      value: categoryLines,
      inline: false,
    })
    .setFooter({
      text: 'Vert = logs activés · Rouge = logs désactivés',
    })
    .setTimestamp();

  const components =
    createLoggingCategoryViewComponents(
      loggingStatus.enabledEvents,
      auditEnabled,
    );

  return {
    embed,
    components,
  };
}

export async function buildLoggingFilterView(
  interaction,
  client,
) {
  const loggingStatus = await getLoggingStatus(
    client,
    interaction.guildId,
  );

  const ignore = loggingStatus.ignore || {
    users: [],
    channels: [],
  };

  const userLines =
    (ignore.users || []).length
      ? ignore.users
          .map((id) => `• Utilisateur \`${id}\``)
          .join('\n')
      : '*Aucun utilisateur ignoré*';

  const channelLines =
    (ignore.channels || []).length
      ? ignore.channels
          .map((id) => `• Salon \`${id}\``)
          .join('\n')
      : '*Aucun salon ignoré*';

  const embed = new EmbedBuilder()
    .setTitle('🔇 Filtres d’exclusion des logs')
    .setDescription(
      'Les utilisateurs et les salons présents dans cette liste seront ignorés lors de l’envoi des logs d’audit.',
    )
    .setColor(getColor('info'))
    .addFields(
      {
        name: 'Utilisateurs ignorés',
        value: userLines.slice(0, 1024),
        inline: false,
      },
      {
        name: 'Salons ignorés',
        value: channelLines.slice(0, 1024),
        inline: false,
      },
    )
    .setFooter({
      text: 'Utilisez les boutons ci-dessous pour ajouter ou supprimer des filtres',
    })
    .setTimestamp();

  const components =
    createLoggingFilterComponents();

  return {
    embed,
    components,
  };
}

export function isCategoriesView(interaction) {
  return (
    interaction.message?.embeds?.[0]?.title ===
    '📋 Catégories d’événements'
  );
}

export function isFilterView(interaction) {
  return (
    interaction.message?.embeds?.[0]?.title ===
    '🔇 Filtres d’exclusion des logs'
  );
}

export async function refreshDashboardMessage(
  interaction,
  client,
) {
  let view;

  if (isCategoriesView(interaction)) {
    view = await buildLoggingCategoriesView(
      interaction,
      client,
    );
  } else if (isFilterView(interaction)) {
    view = await buildLoggingFilterView(
      interaction,
      client,
    );
  } else {
    view = await buildLoggingDashboardView(
      interaction,
      client,
    );
  }

  await interaction.message
    .edit({
      embeds: [view.embed],
      components: view.components,
      content: null,
    })
    .catch(() => {});
}

export default {
  prefixOnly: false,

  async execute(interaction, config, client) {
    try {
      if (
        !interaction.member.permissions.has(
          PermissionsBitField.Flags.ManageGuild,
        )
      ) {
        return await replyUserError(interaction, {
          type: ErrorTypes.PERMISSION,
          message:
            'Vous devez avoir la permission **Gérer le serveur** pour accéder au tableau de bord des logs.',
        });
      }

      await InteractionHelper.safeDefer(
        interaction,
        {
          flags: MessageFlags.Ephemeral,
        },
      );

      const {
        embed,
        components,
      } = await buildLoggingDashboardView(
        interaction,
        client,
      );

      await InteractionHelper.safeEditReply(
        interaction,
        {
          embeds: [embed],
          components,
        },
      );
    } catch (error) {
      logger.error(
        'Erreur du tableau de bord des logs :',
        error,
      );

      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message:
          'Impossible de charger le tableau de bord des logs.',
      });
    }
  },
};

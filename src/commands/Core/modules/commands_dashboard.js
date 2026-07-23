import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import {
  getCommandAccessSnapshot,
  disableCategory,
  enableCategory,
  disableCommand,
  enableCommand,
  resetCategoryCommands,
} from '../../../services/commandAccessService.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';

export const DASHBOARD_CATEGORY_SELECT = 'cmdaccess_category';
export const DASHBOARD_COMMAND_SELECT = 'cmdaccess_command';
export const DASHBOARD_TOGGLE_CATEGORY = 'cmdaccess_toggle_category';
export const DASHBOARD_ENABLE_ALL = 'cmdaccess_enable_all';
export const DASHBOARD_DISABLE_ALL = 'cmdaccess_disable_all';
export const DASHBOARD_RESET_COMMANDS = 'cmdaccess_reset_commands';
export const DASHBOARD_REFRESH = 'cmdaccess_refresh';
export const DASHBOARD_HOME = 'cmdaccess_home';

const STATUS = {
  enabled: '🟢',
  partial: '🟡',
  disabled: '🔴',
};

function customId(base, guildId, suffix = '') {
  return suffix ? `${base}:${guildId}:${suffix}` : `${base}:${guildId}`;
}

function getCategoryStatus(category) {
  if (category.categoryDisabled) {
    return STATUS.disabled;
  }
  if (category.disabledCount === 0) {
    return STATUS.enabled;
  }
  return STATUS.partial;
}

function formatCommandLabel(command) {
  if (command.isSubcommand) {
    return `\`${command.name.replace(/ /g, ' ')}\``;
  }
  return `\`${command.name}\``;
}

function chunkLines(lines, maxLength = 980) {
  const chunks = [];
  let current = '';

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;

    if (next.length > maxLength && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

export function buildOverviewEmbed(snapshot, guild) {
  const fullyEnabled = snapshot.categories.filter(
    (c) => !c.categoryDisabled && c.disabledCount === 0
  ).length;

  const partial = snapshot.categories.filter(
    (c) => !c.categoryDisabled && c.disabledCount > 0
  ).length;

  const disabled = snapshot.categories.filter(
    (c) => c.categoryDisabled
  ).length;

  const categoryLines = snapshot.categories.map((category) => {
    const icon = getCategoryStatus(category);

    const subcommandNote = category.commands.some(
      (c) => c.isSubcommand
    )
      ? ' · sous-commandes incluses'
      : '';

    return `${icon} ${category.icon} **${category.displayName}** — ${category.enabledCount}/${category.totalCount}${subcommandNote}`;
  });

  const fields = [
    {
      name: '📊 Résumé',
      value: [
        `**${snapshot.enabledTotal}/${snapshot.totalCommands}** commandes activées`,
        `${STATUS.enabled} ${fullyEnabled} entièrement activées · ${STATUS.partial} ${partial} partiellement activées · ${STATUS.disabled} ${disabled} désactivées`,
      ].join('\n'),
      inline: false,
    },
    {
      name: '🔑 Légende',
      value: `${STATUS.enabled} Toutes activées · ${STATUS.partial} Certaines désactivées · ${STATUS.disabled} Catégorie désactivée`,
      inline: false,
    },
  ];

  const chunks = chunkLines(categoryLines);

  chunks.forEach((chunk, index) => {
    fields.push({
      name: index === 0
        ? '📁 Catégories'
        : '📁 Catégories (suite)',
      value: chunk,
      inline: false,
    });
  });

  fields.push({
    name: 'Comment utiliser',
    value: [
      '• Sélectionnez une catégorie ci-dessous pour gérer ses commandes et sous-commandes',
      '• `/commands disable` — désactiver une catégorie ou une commande spécifique',
      '• `/commands enable` — réactiver une catégorie ou une commande',
    ].join('\n'),
  });

  return createEmbed({
    title: '⚙️ Gestion des commandes',
    description: `Gérez les commandes slash et préfixées de **${guild.name}**. Les sous-commandes (ex. \`birthday list\`) sont affichées séparément.`,
    color: 'info',
    fields,
    footer: '🔒 Les commandes & configwizard restent toujours disponibles',
  });
}

export function buildCategoryEmbed(category, guild) {
  const statusIcon = getCategoryStatus(category);

  const statusText = category.categoryDisabled
    ? 'Catégorie désactivée'
    : category.disabledCount === 0
      ? 'Toutes les commandes sont activées'
      : `${category.disabledCount} sur ${category.totalCount} désactivées`;

  const commandLines = category.commands.map((command) => {
    const enabled = category.enabledCommands.includes(command.name);
    const icon = enabled ? STATUS.enabled : STATUS.disabled;
    const lock = command.protected ? ' 🔒' : '';

    return `${icon} ${formatCommandLabel(command)}${lock}`;
  });

  const fields = [
    {
      name: `${statusIcon} État`,
      value: statusText,
      inline: true,
    },
    {
      name: '📈 Nombre',
      value: `${category.enabledCount}/${category.totalCount} activées`,
      inline: true,
    },
  ];

  const chunks = chunkLines(commandLines);

  chunks.forEach((chunk, index) => {
    fields.push({
      name: index === 0
        ? '📋 Commandes & sous-commandes'
        : '📋 (suite)',
      value: chunk,
      inline: false,
    });
  });

  fields.push({
    name: 'Comment utiliser',
    value: [
      '• Utilisez le menu déroulant pour activer ou désactiver individuellement les commandes et sous-commandes',
      '• **Tout désactiver** désactive toute la catégorie',
      '• **Réinitialiser les modifications** réactive les commandes désactivées individuellement',
    ].join('\n'),
  });

  return createEmbed({
    title: `${category.icon} ${category.displayName}`,
    description: `Gestion des commandes pour **${guild.name}**.`,
    color: category.categoryDisabled
      ? 'error'
      : category.disabledCount > 0
        ? 'warning'
        : 'success',
    fields,
    footer: '🔒 Les commandes protégées ne peuvent pas être désactivées',
  });
}

export function buildOverviewComponents(guildId, snapshot) {
  const categoryOptions = snapshot.categories
    .slice(0, 25)
    .map((category) => {
      const status = getCategoryStatus(category);

      return new StringSelectMenuOptionBuilder()
        .setLabel(`${category.displayName}`.slice(0, 100))
        .setDescription(
          `${status} ${category.enabledCount}/${category.totalCount} activées`.slice(0, 100)
        )
        .setValue(category.key)
        .setEmoji(category.icon);
    });

  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(customId(DASHBOARD_CATEGORY_SELECT, guildId))
        .setPlaceholder('📁 Sélectionnez une catégorie...')
        .addOptions(categoryOptions),
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId(DASHBOARD_REFRESH, guildId))
        .setLabel('Actualiser')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function buildCategoryComponents(guildId, category) {
  const toggleableCommands = category.commands.filter(
    (command) => !command.protected
  );

  const commandOptions = toggleableCommands
    .slice(0, 25)
    .map((command) => {
      const enabled = category.enabledCommands.includes(command.name);

      const label = command.isSubcommand
        ? command.name.replace(' ', ' · ').slice(0, 100)
        : command.name.slice(0, 100);

      return new StringSelectMenuOptionBuilder()
        .setLabel(label)
        .setDescription(
          (
            enabled
              ? '🟢 Activée — cliquez pour désactiver'
              : '🔴 Désactivée — cliquez pour activer'
          ).slice(0, 100)
        )
        .setValue(command.name);
    });

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId(DASHBOARD_HOME, guildId))
        .setLabel('Retour')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(
          customId(
            DASHBOARD_TOGGLE_CATEGORY,
            guildId,
            category.key
          )
        )
        .setLabel(
          category.categoryDisabled
            ? 'Activer la catégorie'
            : 'Désactiver la catégorie'
        )
        .setEmoji(
          category.categoryDisabled
            ? '🟢'
            : '🔴'
        )
        .setStyle(
          category.categoryDisabled
            ? ButtonStyle.Success
            : ButtonStyle.Danger
        ),

      new ButtonBuilder()
        .setCustomId(
          customId(
            DASHBOARD_ENABLE_ALL,
            guildId,
            category.key
          )
        )
        .setLabel('Tout activer')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(
          customId(
            DASHBOARD_DISABLE_ALL,
            guildId,
            category.key
          )
        )
        .setLabel('Tout désactiver')
        .setEmoji('⛔')
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId(
          customId(
            DASHBOARD_RESET_COMMANDS,
            guildId,
            category.key
          )
        )
        .setLabel('Réinitialiser les modifications')
        .setEmoji('🧹')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  if (commandOptions.length > 0) {
    rows.unshift(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(
            customId(
              DASHBOARD_COMMAND_SELECT,
              guildId,
              category.key
            )
          )
          .setPlaceholder(
            'Activer ou désactiver une commande...'
          )
          .addOptions(commandOptions),
      ),
    );
  }

  return rows;
}

export async function buildDashboardView(
  client,
  guildId,
  guild,
  view = 'overview',
  categoryKey = null
) {
  const config = await getGuildConfig(client, guildId);
  const snapshot = getCommandAccessSnapshot(client, config);

  if (view === 'category' && categoryKey) {
    const category = snapshot.categories.find(
      (entry) => entry.key === categoryKey
    );

    if (!category) {
      return {
        embed: buildOverviewEmbed(snapshot, guild),
        components: buildOverviewComponents(
          guildId,
          snapshot
        ),
      };
    }

    return {
      embed: buildCategoryEmbed(category, guild),
      components: buildCategoryComponents(
        guildId,
        category
      ),
      categoryKey,
    };
  }

  return {
    embed: buildOverviewEmbed(snapshot, guild),
    components: buildOverviewComponents(
      guildId,
      snapshot
    ),
  };
}

export async function handleDashboardComponent(
  interaction,
  client
) {
  const parts = interaction.customId.split(':');

  const action = parts[0];
  const guildId = parts[1];
  const suffix = parts[2] || null;

  if (guildId !== interaction.guildId) {
    return interaction.reply({
      content: 'Ce tableau de bord appartient à un autre serveur.',
      ephemeral: true,
    });
  }

  if (action === DASHBOARD_COMMAND_SELECT) {
    const categoryKey = suffix;
    const commandName = interaction.values[0];

    const config = await getGuildConfig(
      client,
      guildId
    );

    const snapshot = getCommandAccessSnapshot(
      client,
      config
    );

    const category = snapshot.categories.find(
      (entry) => entry.key === categoryKey
    );

    const enabled =
      category?.enabledCommands.includes(commandName);

    if (enabled) {
      await disableCommand(
        client,
        guildId,
        commandName
      );
    } else {
      await enableCommand(
        client,
        guildId,
        commandName
      );
    }

    const view = await buildDashboardView(
      client,
      guildId,
      interaction.guild,
      'category',
      categoryKey
    );

    return interaction.update({
      embeds: [view.embed],
      components: view.components,
    });
  }

  if (action === DASHBOARD_CATEGORY_SELECT) {
    const categoryKey = interaction.values[0];

    const view = await buildDashboardView(
      client,
      guildId,
      interaction.guild,
      'category',
      categoryKey
    );

    return interaction.update({
      embeds: [view.embed],
      components: view.components,
    });
  }

  await interaction.deferUpdate();

  if (
    action === DASHBOARD_REFRESH ||
    action === DASHBOARD_HOME
  ) {
    const view = await buildDashboardView(
      client,
      guildId,
      interaction.guild,
      'overview'
    );

    return interaction.editReply({
      embeds: [view.embed],
      components: view.components,
    });
  }

  if (action === DASHBOARD_TOGGLE_CATEGORY) {
    const categoryKey = suffix;

    const config = await getGuildConfig(
      client,
      guildId
    );

    const snapshot = getCommandAccessSnapshot(
      client,
      config
    );

    const category = snapshot.categories.find(
      (entry) => entry.key === categoryKey
    );

    if (category?.categoryDisabled) {
      await enableCategory(
        client,
        guildId,
        categoryKey
      );
    } else {
      await disableCategory(
        client,
        guildId,
        categoryKey
      );
    }

    const view = await buildDashboardView(
      client,
      guildId,
      interaction.guild,
      'category',
      categoryKey
    );

    return interaction.editReply({
      embeds: [view.embed],
      components: view.components,
    });
  }

  if (action === DASHBOARD_ENABLE_ALL) {
    await enableCategory(
      client,
      guildId,
      suffix
    );

    await resetCategoryCommands(
      client,
      guildId,
      suffix
    );

    const view = await buildDashboardView(
      client,
      guildId,
      interaction.guild,
      'category',
      suffix
    );

    return interaction.editReply({
      embeds: [view.embed],
      components: view.components,
    });
  }

  if (action === DASHBOARD_DISABLE_ALL) {
    await disableCategory(
      client,
      guildId,
      suffix
    );

    const view = await buildDashboardView(
      client,
      guildId,
      interaction.guild,
      'category',
      suffix
    );

    return interaction.editReply({
      embeds: [view.embed],
      components: view.components,
    });
  }

  if (action === DASHBOARD_RESET_COMMANDS) {
    await enableCategory(
      client,
      guildId,
      suffix
    );

    await resetCategoryCommands(
      client,
      guildId,
      suffix
    );

    const view = await buildDashboardView(
      client,
      guildId,
      interaction.guild,
      'category',
      suffix
    );

    return interaction.editReply({
      embeds: [view.embed],
      components: view.components,
    });
  }

  return interaction.editReply({
    content: 'Action du tableau de bord inconnue.',
    embeds: [],
    components: [],
  });
}

export function isCommandAccessCustomId(
  customIdValue
) {
  return customIdValue.startsWith(
    'cmdaccess_'
  );
}

export function createDashboardCollectorFilter(
  userId,
  guildId
) {
  return (componentInteraction) =>
    componentInteraction.user.id === userId &&
    componentInteraction.customId.includes(
      `:${guildId}`
    );
}

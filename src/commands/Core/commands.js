import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import {
  disableCategory,
  enableCategory,
  disableCommand,
  enableCommand,
  resolveCategoryChoice,
  buildCommandRegistry,
  isProtectedCommand,
} from '../../services/commandAccessService.js';
import {
  buildDashboardView,
  handleDashboardComponent,
  createDashboardCollectorFilter,
  isCommandAccessCustomId,
} from './modules/commands_dashboard.js';

const DASHBOARD_TIMEOUT_MS = 10 * 60 * 1000;

function buildCategoryChoices(client) {
  const registry = buildCommandRegistry(client);

  return [...registry.values()]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .slice(0, 25)
    .map((category) => ({
      name: `${category.icon} ${category.displayName}`.slice(0, 100),
      value: category.key,
    }));
}

async function ensureManageGuild(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await replyUserError(interaction, {
      type: ErrorTypes.PERMISSION,
      message: 'Vous devez avoir la permission **Gérer le serveur** pour gérer les commandes.',
    });

    return false;
  }

  return true;
}

export default {
  data: new SlashCommandBuilder()
    .setName('commands')
    .setDescription('Activer ou désactiver les commandes et catégories du bot sur ce serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)

    .addSubcommand((subcommand) =>
      subcommand
        .setName('dashboard')
        .setDescription('Ouvrir le tableau de bord interactif de gestion des commandes'),
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription('Désactiver une commande ou une catégorie entière')

        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('Désactiver une seule commande ou une catégorie entière')
            .setRequired(true)
            .addChoices(
              {
                name: 'Catégorie',
                value: 'category',
              },
              {
                name: 'Commande',
                value: 'command',
              },
            ),
        )

        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Nom de la catégorie ou de la commande')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )

    .addSubcommand((subcommand) =>
      subcommand
        .setName('enable')
        .setDescription('Activer une commande ou une catégorie entière')

        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('Activer une seule commande ou une catégorie entière')
            .setRequired(true)
            .addChoices(
              {
                name: 'Catégorie',
                value: 'category',
              },
              {
                name: 'Commande',
                value: 'command',
              },
            ),
        )

        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Nom de la catégorie ou de la commande')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),

  category: 'Core',

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name !== 'target') {
      return interaction.respond([]);
    }

    const scope = interaction.options.getString('scope');
    const query = focused.value.toLowerCase();

    if (scope === 'category') {
      const choices = buildCategoryChoices(interaction.client)
        .filter(
          (choice) =>
            choice.name.toLowerCase().includes(query) ||
            choice.value.includes(query),
        )
        .slice(0, 25);

      return interaction.respond(choices);
    }

    // Pour les commandes, récupérer toutes les commandes, y compris les sous-commandes
    const registry = buildCommandRegistry(interaction.client);
    const allCommands = [];

    // Vérifier si la recherche correspond au nom d'une catégorie
    // Si oui, afficher les commandes de cette catégorie
    const matchedCategory = resolveCategoryChoice(
      interaction.client,
      query,
    );

    if (matchedCategory) {
      // Afficher les commandes de la catégorie correspondante
      for (const command of matchedCategory.commands) {
        if (!isProtectedCommand(command.name)) {
          allCommands.push(command.name);
        }
      }
    } else {
      // Afficher toutes les commandes
      for (const category of registry.values()) {
        for (const command of category.commands) {
          // Inclure les commandes principales et les sous-commandes
          if (!isProtectedCommand(command.name)) {
            allCommands.push(command.name);
          }
        }
      }
    }

    const choices = allCommands
      .filter((name) => name.includes(query))
      .slice(0, 25)
      .map((name) => ({
        name: `/${name}`,
        value: name,
      }));

    return interaction.respond(choices);
  },

  async execute(interaction, config, client) {
    if (!(await ensureManageGuild(interaction))) {
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    // ================================
    // TABLEAU DE BORD
    // ================================

    if (subcommand === 'dashboard') {
      const deferred = await InteractionHelper.safeDefer(
        interaction,
        {
          flags: MessageFlags.Ephemeral,
        },
      );

      if (!deferred) {
        return;
      }

      const view = await buildDashboardView(
        client,
        interaction.guildId,
        interaction.guild,
        'overview',
      );

      await InteractionHelper.safeEditReply(
        interaction,
        {
          embeds: [view.embed],
          components: view.components,
        },
      );

      const replyMessage = await interaction
        .fetchReply()
        .catch(() => null);

      if (!replyMessage) {
        return;
      }

      const collector = replyMessage.createMessageComponentCollector({
        filter: createDashboardCollectorFilter(
          interaction.user.id,
          interaction.guildId,
        ),
        time: DASHBOARD_TIMEOUT_MS,
      });

      collector.on(
        'collect',
        async (componentInteraction) => {
          try {
            if (
              !isCommandAccessCustomId(
                componentInteraction.customId,
              )
            ) {
              return;
            }

            await handleDashboardComponent(
              componentInteraction,
              client,
            );

          } catch (error) {
            logger.error(
              'Échec de l\'interaction avec le tableau de bord des commandes',
              {
                error: error.message,
                customId: componentInteraction.customId,
                guildId: interaction.guildId,
              },
            );

            await replyUserError(
              componentInteraction,
              {
                type: ErrorTypes.UNKNOWN,
                message:
                  error.message ||
                  'Impossible de mettre à jour les permissions des commandes.',
              },
            ).catch(() => {});
          }
        },
      );

      collector.on(
        'end',
        async () => {
          const finalView = await buildDashboardView(
            client,
            interaction.guildId,
            interaction.guild,
            'overview',
          );

          const disabledComponents =
            finalView.components.map((row) => {
              const newRow = row.toJSON();

              newRow.components =
                newRow.components.map(
                  (component) => ({
                    ...component,
                    disabled: true,
                  }),
                );

              return newRow;
            });

          await replyMessage
            .edit({
              components: disabledComponents,
            })
            .catch(() => {});
        },
      );

      return;
    }

    // ================================
    // ACTIVATION / DÉSACTIVATION
    // ================================

    const scope =
      interaction.options.getString('scope');

    const target =
      interaction.options.getString('target');

    const isDisable =
      subcommand === 'disable';

    const deferred =
      await InteractionHelper.safeDefer(
        interaction,
        {
          flags: MessageFlags.Ephemeral,
        },
      );

    if (!deferred) {
      return;
    }

    // ================================
    // GESTION DES CATÉGORIES
    // ================================

    if (scope === 'category') {
      const category =
        resolveCategoryChoice(
          client,
          target,
        );

      if (!category) {
        return await replyUserError(
          interaction,
          {
            type: ErrorTypes.UNKNOWN,
            message:
              `Aucune catégorie ne correspond à \`${target}\`. Utilisez \`/commands dashboard\` pour parcourir les catégories disponibles.`,
          },
        );
      }

      // Désactiver une catégorie
      if (isDisable) {
        await disableCategory(
          client,
          interaction.guildId,
          category.key,
        );

        return InteractionHelper.safeEditReply(
          interaction,
          {
            embeds: [
              successEmbed(
                'Catégorie désactivée',
                `Toutes les commandes de la catégorie **${category.displayName}** sont maintenant désactivées.\nLes commandes protégées restent disponibles.`,
              ),
            ],
          },
        );
      }

      // Activer une catégorie
      await enableCategory(
        client,
        interaction.guildId,
        category.key,
      );

      return InteractionHelper.safeEditReply(
        interaction,
        {
          embeds: [
            successEmbed(
              'Catégorie activée',
              `Les commandes de la catégorie **${category.displayName}** sont maintenant activées, à l'exception des commandes désactivées individuellement.`,
            ),
          ],
        },
      );
    }

    // ================================
    // GESTION DES COMMANDES
    // ================================

    const commandName =
      target.toLowerCase();

    // Désactiver une commande
    if (isDisable) {
      await disableCommand(
        client,
        interaction.guildId,
        commandName,
      );

      return InteractionHelper.safeEditReply(
        interaction,
        {
          embeds: [
            successEmbed(
              'Commande désactivée',
              `La commande \`/${commandName}\` est maintenant désactivée sur ce serveur.`,
            ),
          ],
        },
      );
    }

    // Activer une commande
    await enableCommand(
      client,
      interaction.guildId,
      commandName,
    );

    return InteractionHelper.safeEditReply(
      interaction,
      {
        embeds: [
          successEmbed(
            'Commande activée',
            `La commande \`/${commandName}\` est maintenant activée sur ce serveur.`,
          ),
        ],
      },
    );
  },
};

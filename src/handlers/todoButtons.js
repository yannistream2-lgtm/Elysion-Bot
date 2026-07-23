import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { successEmbed } from '../utils/embeds.js';
import { getFromDb, setInDb } from '../utils/database.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { logger } from '../utils/logger.js';

import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';

function buildSharedTodoViewPayload(listData, listId, guild) {
  const memberList = (listData.members || []).map(memberId => {
    const member = guild?.members?.cache?.get(memberId);
    return member ? member.user.username : `<@${memberId}>`;
  }).join(', ');

  const owner = guild?.members?.cache?.get(listData.creatorId);
  const ownerName = owner ? owner.user.username : `<@${listData.creatorId}>`;

  const tasks = Array.isArray(listData.tasks) ? listData.tasks : [];

  if (tasks.length === 0) {
    return {
      embeds: [
        successEmbed(
          `📋 **${listData.name}**\n\n` +
          `👑 **Propriétaire :** ${ownerName}\n` +
          `👥 **Membres :** ${memberList}\n\n` +
          '*Cette liste est actuellement vide. Utilisez le bouton « Ajouter une tâche » pour ajouter des tâches !*',
          `Liste partagée (ID : \`${listId}\`)`
        )
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`shared_todo_add_${listId}`)
            .setLabel('Ajouter une tâche')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`shared_todo_complete_${listId}`)
            .setLabel('Terminer une tâche')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`shared_todo_remove_${listId}`)
            .setLabel('Supprimer une tâche')
            .setStyle(ButtonStyle.Danger)
        )
      ]
    };
  }

  const taskList = tasks
    .map(task =>
      `${task.completed ? '✅' : '📝'} #${task.id} ${task.text} ` +
      `\`[${new Date(task.createdAt).toLocaleDateString()}]` +
      (task.completed ? ` • Terminée par <@${task.completedBy}>` : '') + '`'
    )
    .join('\n');

  return {
    embeds: [
      successEmbed(
        `📋 **${listData.name}**\n\n` +
        `👑 **Propriétaire :** ${ownerName}\n` +
        `👥 **Membres :** ${memberList}\n\n` +
        `**Tâches :**\n${taskList}`,
        `Liste partagée (ID : \`${listId}\`)`
      )
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`shared_todo_add_${listId}`)
          .setLabel('Ajouter une tâche')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`shared_todo_complete_${listId}`)
          .setLabel('Terminer une tâche')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`shared_todo_remove_${listId}`)
          .setLabel('Supprimer une tâche')
          .setStyle(ButtonStyle.Danger)
      )
    ]
  };
}

async function refreshSharedTodoMessage(interaction, listId, messageId) {
  if (!messageId || !interaction.channel) {
    return;
  }

  const listKey = `shared_todo_${listId}`;
  const listData = await getFromDb(listKey, null);

  if (!listData) {
    return;
  }

  try {
    const targetMessage = await interaction.channel.messages.fetch(messageId);

    if (!targetMessage) {
      return;
    }

    const updatedPayload = buildSharedTodoViewPayload(
      listData,
      listId,
      interaction.guild
    );

    await targetMessage.edit(updatedPayload);
  } catch (error) {
    logger.warn('Impossible de mettre à jour le message de la liste partagée', {
      listId,
      messageId,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      error: error.message
    });
  }
}

const sharedTodoAddHandler = {
  name: 'shared_todo_add',

  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = interaction.message?.id;

    if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'ID de liste partagée invalide.'
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`shared_todo_add_modal:${listId}:${sourceMessageId || ''}`)
      .setTitle('Ajouter une tâche à la liste partagée');

    const taskInput = new TextInputBuilder()
      .setCustomId('task_text')
      .setLabel('Entrez la description de la tâche')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(200);

    const actionRow = new ActionRowBuilder().addComponents(taskInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }
};

const sharedTodoCompleteHandler = {
  name: 'shared_todo_complete',

  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = interaction.message?.id;

    if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'ID de liste partagée invalide.'
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`shared_todo_complete_modal:${listId}:${sourceMessageId || ''}`)
      .setTitle('Terminer une tâche de la liste partagée');

    const taskIdInput = new TextInputBuilder()
      .setCustomId('task_id')
      .setLabel('Entrez l’ID de la tâche à terminer')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('Ex. : 1, 2, 3');

    const actionRow = new ActionRowBuilder().addComponents(taskIdInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }
};

const sharedTodoRemoveHandler = {
  name: 'shared_todo_remove',

  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = interaction.message?.id;

    if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'ID de liste partagée invalide.'
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`shared_todo_remove_modal:${listId}:${sourceMessageId || ''}`)
      .setTitle('Supprimer une tâche de la liste partagée');

    const taskIdInput = new TextInputBuilder()
      .setCustomId('task_id')
      .setLabel('Entrez l’ID de la tâche à supprimer')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('Ex. : 1, 2, 3');

    const actionRow = new ActionRowBuilder().addComponents(taskIdInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }
};

const sharedTodoAddModalHandler = {
  name: 'shared_todo_add_modal',

  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = args[1] || null;
    const taskText = interaction.fields.getTextInputValue('task_text');
    const userId = interaction.user.id;

    try {
      const allowed = await checkRateLimit(
        `${userId}:shared_todo_add`,
        5,
        30000
      );

      if (!allowed) {
        return await replyUserError(interaction, {
          type: ErrorTypes.RATE_LIMIT,
          message: 'Vous ajoutez des tâches trop rapidement. Veuillez patienter avant de réessayer.'
        });
      }

      if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
        return await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'ID de liste partagée invalide.'
        });
      }

      if (!taskText || taskText.trim().length === 0) {
        return await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'Le texte de la tâche ne peut pas être vide.'
        });
      }

      const listKey = `shared_todo_${listId}`;
      let listData = await getFromDb(listKey, null);

      if (!listData) {
        return await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'Liste partagée introuvable.'
        });
      }

      if (!listData.members || !listData.members.includes(userId)) {
        return await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'Vous n’avez pas accès à cette liste.'
        });
      }

      if (!listData.tasks) listData.tasks = [];
      if (!listData.nextId) listData.nextId = 1;

      const newTask = {
        id: listData.nextId++,
        text: taskText,
        completed: false,
        createdAt: new Date().toISOString(),
        createdBy: userId
      };

      listData.tasks.push(newTask);
      await setInDb(listKey, listData);

      await refreshSharedTodoMessage(
        interaction,
        listId,
        sourceMessageId
      );

      return interaction.reply({
        embeds: [
          successEmbed(
            'Tâche ajoutée',
            `« ${taskText} » a été ajoutée à la liste partagée.`
          )
        ],
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      logger.error('Erreur lors de l’ajout d’une tâche à la liste partagée :', error);

      return await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Une erreur est survenue lors de l’ajout de la tâche.'
      });
    }
  }
};

const sharedTodoCompleteModalHandler = {
  name: 'shared_todo_complete_modal',

  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = args[1] || null;
    const taskId = parseInt(
      interaction.fields.getTextInputValue('task_id'),
      10
    );
    const userId = interaction.user.id;

    try {
      const allowed = await checkRateLimit(
        `${userId}:shared_todo_complete`,
        5,
        30000
      );

      if (!allowed) {
        return await replyUserError(interaction, {
          type: ErrorTypes.RATE_LIMIT,
          message: 'Vous terminez des tâches trop rapidement. Veuillez patienter avant de réessayer.'
        });
      }

      if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
        return await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'ID de liste partagée invalide.'
        });
      }

      if (!Number.isInteger(taskId) || taskId <= 0) {
        return await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'L’ID de la tâche doit être un nombre positif.'
        });
      }

      const listKey = `shared_todo_${listId}`;
      let listData = await getFromDb(listKey, null);

      if (!listData) {
        return await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'Liste partagée introuvable.'
        });
      }

      if (!listData.members || !listData.members.includes(userId)) {
        return await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'Vous n’avez pas accès à cette liste.'
        });
      }

      if (!listData.tasks) listData.tasks = [];

      const task = listData.tasks.find(
        t => t.id === taskId
      );

      if (!task) {
        return await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'Tâche introuvable.'
        });
      }

      if (task.completed) {
        return await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: `La tâche n°${task.id} est déjà terminée.`
        });
      }

      task.completed = true;
      task.completedBy = userId;
      task.completedAt = new Date().toISOString();

      await setInDb(listKey, listData);

      await refreshSharedTodoMessage(
        interaction,
        listId,
        sourceMessageId
      );

      return interaction.reply({
        embeds: [
          successEmbed(
            'Tâche terminée',
            `« ${task.text} » a été marquée comme terminée !`
          )
        ],
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      logger.error('Erreur lors de la finalisation de la tâche :', error);

      return await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Une erreur est survenue lors de la finalisation de la tâche.'
      });
    }
  }
};

const sharedTodoRemoveModalHandler = {
  name: 'shared_todo_remove_modal',

  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = args[1] || null;
    const taskId = parseInt(
      interaction.fields.getTextInputValue('task_id'),
      10
    );
    const userId = interaction.user.id;

    try {
      const allowed = await checkRateLimit(
        `${userId}:shared_todo_remove`,
        5,
        30000
      );

      if (!allowed) {
        return await replyUserError(interaction, {
          type: ErrorTypes.RATE_LIMIT,
          message: 'Vous supprimez des tâches trop rapidement. Veuillez patienter avant de réessayer.'
        });
      }

      if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
        return await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'ID de liste partagée invalide.'
        });
      }

      if (!Number.isInteger(taskId) || taskId <= 0) {
        return await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'L’ID de la tâche doit être un nombre positif.'
        });
      }

      const listKey = `shared_todo_${listId}`;
      const listData = await getFromDb(listKey, null);

      if (!listData) {
        return await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'Liste partagée introuvable.'
        });
      }

      if (!listData.members || !listData.members.includes(userId)) {
        return await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'Vous n’avez pas accès à cette liste.'
        });
      }

      if (!Array.isArray(listData.tasks)) {
        listData.tasks = [];
      }

      const taskIndex = listData.tasks.findIndex(
        task => task.id === taskId
      );

      if (taskIndex === -1) {
        return await replyUserError(interaction, {
          type: ErrorTypes.UNKNOWN,
          message: 'Tâche introuvable.'
        });
      }

      const [removedTask] = listData.tasks.splice(
        taskIndex,
        1
      );

      await setInDb(listKey, listData);

      await refreshSharedTodoMessage(
        interaction,
        listId,
        sourceMessageId
      );

      return interaction.reply({
        embeds: [
          successEmbed(
            'Tâche supprimée',
            `« ${removedTask.text} » a été supprimée de la liste partagée.`
          )
        ],
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      logger.error('Erreur lors de la suppression de la tâche :', error);

      return await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'Une erreur est survenue lors de la suppression de la tâche.'
      });
    }
  }
};

export default sharedTodoAddHandler;

export {
  sharedTodoCompleteHandler,
  sharedTodoRemoveHandler,
  sharedTodoAddModalHandler,
  sharedTodoCompleteModalHandler,
  sharedTodoRemoveModalHandler
};

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { infoEmbed, successEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { verifyUser } from '../../services/verificationService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Vérifiez votre compte et accédez au serveur'),

    async execute(interaction, config, client) {
        const guild = interaction.guild;

        const result = await verifyUser(client, guild.id, interaction.user.id, {
            source: 'command_self',
            moderatorId: null
        });

        if (result.status === 'already_verified') {
            return await InteractionHelper.safeReply(interaction, {
                embeds: [infoEmbed('Déjà vérifié', "Vous êtes déjà vérifié.")],
                flags: MessageFlags.Ephemeral
            });
        }

        await InteractionHelper.safeReply(interaction, {
            embeds: [successEmbed(
                "Vérification terminée",
                `Vous avez été vérifié et avez reçu le rôle **${result.roleName}** ! Bienvenue sur le serveur ! 🎉`
            )],
            flags: MessageFlags.Ephemeral
        });
    }
};

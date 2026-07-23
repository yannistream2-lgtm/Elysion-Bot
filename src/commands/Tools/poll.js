import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const MAX_OPTIONS = 10;

export default {
data: new SlashCommandBuilder()
.setName('poll')
.setDescription('Créer un sondage simple avec jusqu’à 10 options')
.addStringOption(option =>
option.setName('question')
.setDescription('La question du sondage')
.setRequired(true))
.addStringOption(option =>
option.setName('option1')
.setDescription('Première option')
.setRequired(true))
.addStringOption(option =>
option.setName('option2')
.setDescription('Deuxième option')
.setRequired(true))
.addStringOption(option =>
option.setName('option3')
.setDescription('Troisième option (facultatif)')
.setRequired(false))
.addStringOption(option =>
option.setName('option4')
.setDescription('Quatrième option (facultatif)')
.setRequired(false))
.addStringOption(option =>
option.setName('option5')
.setDescription('Cinquième option (facultatif)')
.setRequired(false))
.addStringOption(option =>
option.setName('option6')
.setDescription('Sixième option (facultatif)')
.setRequired(false))
.addStringOption(option =>
option.setName('option7')
.setDescription('Septième option (facultatif)')
.setRequired(false))
.addStringOption(option =>
option.setName('option8')
.setDescription('Huitième option (facultatif)')
.setRequired(false))
.addStringOption(option =>
option.setName('option9')
.setDescription('Neuvième option (facultatif)')
.setRequired(false))
.addStringOption(option =>
option.setName('option10')
.setDescription('Dixième option (facultatif)')
.setRequired(false))
.addBooleanOption(option =>
option.setName('anonymous')
.setDescription('Rendre le sondage anonyme (par défaut : faux)')
.setRequired(false)),


async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction, {
        flags: MessageFlags.Ephemeral
    });

    if (!deferSuccess) {
        logger.warn(`Échec de la préparation de l’interaction du sondage`, {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            commandName: 'poll'
        });
        return;
    }

    const question = interaction.options.getString('question');
    const isAnonymous = interaction.options.getBoolean('anonymous') || false;

    const options = [];

    for (let i = 1; i <= MAX_OPTIONS; i++) {
        const option = interaction.options.getString(`option${i}`);

        if (option) {
            options.push(option);
        }
    }

    if (options.length < 2) {
        throw new Error('Vous devez fournir au moins 2 options pour le sondage.');
    }

    let description = `**${question}**\n\n`;

    options.forEach((option, index) => {
        description += `${EMOJIS[index]} ${option}\n`;
    });

    if (isAnonymous) {
        description += '\n*Ce sondage est anonyme. Les votes ne sont pas associés aux utilisateurs.*';
    } else {
        description += '\n*Réagissez avec l’emoji correspondant pour voter !*';
    }

    const embed = successEmbed(
        `📊 ${isAnonymous ? 'Sondage anonyme' : 'Sondage'}`,
        description
    );

    const message = await interaction.channel.send({
        embeds: [embed]
    });

    for (let i = 0; i < options.length; i++) {
        await message.react(EMOJIS[i]);
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    await InteractionHelper.safeEditReply(interaction, {
        content: '✅ Le sondage a été créé avec succès !',
    });
},


};

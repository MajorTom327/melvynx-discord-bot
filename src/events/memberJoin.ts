import type { GuildMember } from "discord.js";
import { ChannelType } from "discord.js";
import { readFileSync } from "fs";
import { getMessageState, getUser, isRecentlyKicked, startQuiz, users } from "../data/users";
import { startQuizButton } from "../utils/embed";
import dayjs from "dayjs";
import { redisClient } from "../client";

export const handleMemberJoin = async(member: GuildMember): Promise<void> => {
  const channel = await member.guild.channels.create({
    name: member.user.username,
    type: ChannelType.GuildText,
    position: 0,
    permissionOverwrites: [
      { id: member.guild.id, deny: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
      { id: member.id, allow: ["ViewChannel", "ReadMessageHistory", "SendMessages"] }
    ]
  });

  const TTS = isRecentlyKicked(member.id) ? "kicked" : "info";
  const canRestart = dayjs().add(parseInt(process.env.TIME_TO_WAIT_AFTER_KICK ?? "5"), "minute").unix();

  const message = await channel.send({
    content: readFileSync(`./resources/${TTS}.txt`, "utf-8")
      .replace("{userId}", member.id)
      .replace("{time}", canRestart.toString()),
    components: [{
      type: 1,
      components: [startQuizButton(TTS === "kicked")]
    }]
  });

  if (TTS === "kicked") {
    setInterval(() => {
      if (dayjs().unix() > getUser(member.id)?.canRestart!) {
        message.edit({
          content: readFileSync("./resources/info.txt", "utf-8")
            .replace("{userId}", member.id)
            .replace("{time}", canRestart.toString()),
          components: [{
            type: 1,
            components: [startQuizButton(false)]
          }]
        });

        clearInterval(this);
      }
    }, 1000);
  }

  setTimeout(async() => {
    if (!users.find((u) => u.userId === member.id)?.quizStarted) {
      channel.delete();
      await member.send({
        content: "Vous avez été expulsé du serveur car vous n'avez pas démarré le quiz à temps.",
        components: []
      }).catch(() => console.log("Member has DMs disabled"));

      member.kick();
    }
  }, 3600000);

  message.createMessageComponentCollector({ filter: (i) => i.customId === "start_quiz" }).on("collect", async(i) => {
    await i.deferUpdate();
    startQuiz(member.id);
    redisClient.set(member.id, dayjs().unix().toString());
    await i.editReply({
      content: getMessageState(member.id),
      components: []
    });
  });

  users.push({
    channelId: channel.id,
    userId: member.id,
    quizStarted: false,
    data: {
      state: "MELVYNX_LOVE_STACK"
    }
  });
};
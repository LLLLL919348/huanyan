using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.Audio;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

/// <summary>
/// 酒狐语音系统：
/// - 按语音文件名与目录分类（mode/idle=正常、mode/attack=战斗、ai/hurt=受击、environment/*=环境）
/// - 相邻语音至少间隔10秒，一次只播一段
/// - 进入可播放语音模式超过30秒后，正常状态下每秒5%几率随机播一句正常语音
/// - 受击或发现敌人时，优先播放受击/战斗语音
/// </summary>
public static class 酒狐语音
{
    //分类音频池
    private static readonly List<SoundStyle> Idle = new();
    private static readonly List<SoundStyle> Feed = new();
    private static readonly List<SoundStyle> Attack = new();
    private static readonly List<SoundStyle> Hurt = new();
    private static readonly List<SoundStyle> Tame = new();
    private static readonly List<SoundStyle> EnvRain = new();
    private static readonly List<SoundStyle> EnvSnow = new();
    private static readonly List<SoundStyle> EnvNight = new();
    private static readonly List<SoundStyle> EnvMorning = new();
    private static readonly List<SoundStyle> EnvHot = new();
    private static readonly List<SoundStyle> EnvCold = new();

    //规则（tick：60=1秒）
    public const int MinVoiceGap = 600;       //相邻语音至少10秒
    public const int VoiceModeDelay = 1200;   //进入可播放语音模式20秒后开聊
    public const float RandomChance = 0.20f;  //每秒20%

    private static readonly Dictionary<int, VoiceState> States = new();
    private sealed class VoiceState
    {
        public long ModeStart;
        public long LastVoiceTick;
        public int HurtTimer;
        public int LastLife;
        public bool HadEnemy;
    }

    public static void Load(Mod mod)
    {
        foreach (string file in mod.GetFileNames())
        {
            if (!file.EndsWith(".ogg", StringComparison.OrdinalIgnoreCase))
                continue;
            string path = file.Substring(0, file.Length - 4).Replace('\\', '/');
            //SoundStyle 为结构体，直接用 路径+类型 构造；路径为 <Mod名>/相对路径
            SoundStyle style = new($"{mod.Name}/{path}", SoundType.Sound)
            {
                MaxInstances = 1,   //同一段语音最多同时一个实例，杜绝叠加播放
                Volume = 1f,
                PitchVariance = 0.05f
            };
            Categorize(path, style);
        }
    }

    private static void Categorize(string path, SoundStyle style)
    {
        if (path.Contains("mode/idle")) { Idle.Add(style); return; }
        if (path.Contains("mode/feed")) { Feed.Add(style); return; }
        if (path.Contains("mode/attack")) { Attack.Add(style); return; }
        if (path.Contains("ai/hurt")) { Hurt.Add(style); return; }          //含 hurt_player
        if (path.Contains("ai/find_target")) { Attack.Add(style); return; } //发现敌人→战斗
        if (path.Contains("ai/tamed")) { Tame.Add(style); return; }
        if (path.Contains("environment/rain")) { EnvRain.Add(style); return; }
        if (path.Contains("environment/snow")) { EnvSnow.Add(style); return; }
        if (path.Contains("environment/night")) { EnvNight.Add(style); return; }
        if (path.Contains("environment/morning")) { EnvMorning.Add(style); return; }
        if (path.Contains("environment/hot")) { EnvHot.Add(style); return; }
        if (path.Contains("environment/cold")) { EnvCold.Add(style); return; }
        //ai/death、ai/item_get、other/credit 不自动播放
    }

    public static void Unload()
    {
        Idle.Clear(); Feed.Clear(); Attack.Clear(); Hurt.Clear(); Tame.Clear();
        EnvRain.Clear(); EnvSnow.Clear(); EnvNight.Clear(); EnvMorning.Clear();
        EnvHot.Clear(); EnvCold.Clear(); States.Clear();
    }

    private static VoiceState GetState(NPC npc)
    {
        if (!States.TryGetValue(npc.whoAmI, out VoiceState s))
        {
            s = new VoiceState { ModeStart = Main.GameUpdateCount, LastLife = npc.life };
            States[npc.whoAmI] = s;
        }
        return s;
    }

    public static void Update(NPC npc)
    {
        if (Main.dedServ) return;                            //服务器不播音频
        if (酒狐NPC状态.GetMode(npc) == 酒狐状态.坐下) return;   //坐下不说话
        if (Idle.Count == 0 && Attack.Count == 0 && Hurt.Count == 0)
            return;

        VoiceState st = GetState(npc);

        //受击检测：生命下降即视为受伤
        if (npc.life < st.LastLife) st.HurtTimer = 60 * 3;
        st.LastLife = npc.life;
        if (st.HurtTimer > 0) st.HurtTimer--;

        long now = Main.GameUpdateCount;
        if (now - st.LastVoiceTick < MinVoiceGap) return;    //至少10秒间隔

        bool hasEnemy = 酒狐攻击.CurrentTargetIndex >= 0;

        //优先级1：受击 → 立即反应（同一击只播一次，不受30秒闲聊等待限制）
        if (st.HurtTimer > 0 && Hurt.Count > 0)
        {
            Play(npc, Hurt);
            st.LastVoiceTick = now;
            st.HurtTimer = 0;
            return;
        }

        //优先级2：刚发现敌人 → 播战斗语音
        if (hasEnemy && !st.HadEnemy && Attack.Count > 0)
        {
            Play(npc, Attack);
            st.LastVoiceTick = now;
            st.HadEnemy = true;
            return;
        }
        st.HadEnemy = hasEnemy;

        //正常语音：进入可播放语音模式超过30秒后，每秒5%几率
        if (now - st.ModeStart < VoiceModeDelay) return;
        if (now % 60 != 0) return;
        if (Main.rand.NextFloat() >= RandomChance) return;

        //战斗时用战斗语音，否则用正常（按环境分类）
        if (hasEnemy && Attack.Count > 0) { Play(npc, Attack); st.LastVoiceTick = now; return; }
        PlayNormal(npc);
        st.LastVoiceTick = now;
    }

    private static void PlayNormal(NPC npc)
    {
        Play(npc, PickNormalPool(npc));
    }

    //按当前场景挑选正常语音类别
    private static List<SoundStyle> PickNormalPool(NPC npc)
    {
        Player owner = 酒狐NPC状态.GetTargetPlayer(npc);
        bool morning = Main.dayTime && Main.time < 8100f;
        if (owner.ZoneSnow && EnvCold.Count > 0) return EnvCold;
        if (owner.ZoneDesert && EnvHot.Count > 0) return EnvHot;
        if (Main.raining && EnvRain.Count > 0) return EnvRain;
        if (!Main.dayTime && EnvNight.Count > 0) return EnvNight;
        if (morning && EnvMorning.Count > 0) return EnvMorning;
        if (Idle.Count > 0) return Idle;
        if (Tame.Count > 0) return Tame;
        return Feed;
    }

    private static void Play(NPC npc, List<SoundStyle> pool)
    {
        if (pool.Count == 0) return;
        SoundStyle s = pool[Main.rand.Next(pool.Count)];
        SoundEngine.PlaySound(s, npc.Center);
    }
}

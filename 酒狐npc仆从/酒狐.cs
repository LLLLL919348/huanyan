using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using ReLogic.Content;
using Terraria;
using Terraria.Audio;
using Terraria.GameContent;
using Terraria.GameContent.Bestiary;
using Terraria.ID;
using Terraria.ModLoader;

namespace 酒狐npc仆从;

public sealed class 酒狐 : ModNPC
{
    public override string Texture => "酒狐npc仆从/Content/Images/酒狐/zhanli";

    //三张贴图资源
    private static Asset<Texture2D> TexStand;
    private static Asset<Texture2D> TexRun;
    private static Asset<Texture2D> CombatArmTexture;
    //新皮肤贴图（可选；未勾选配置或加载失败时自动回退原皮肤）
    private static Asset<Texture2D> TexStand2;
    private static Asset<Texture2D> TexRun2;
    private static Asset<Texture2D> CombatArmTexture2;
    private static Asset<Texture2D> PetpetSheet2;

    //新皮肤是否生效（配置勾+ 三张贴图都确实加载到了）
    internal static bool 用新皮肤()
    {
        if (!酒狐任务配置.取新皮肤()) return false;
        return TexStand2 != null && TexStand2.Value != null
            && TexRun2 != null && TexRun2.Value != null
            && CombatArmTexture2 != null && CombatArmTexture2.Value != null;
    }
    internal static Texture2D 站立贴图 => 用新皮肤() ? TexStand2.Value : TexStand.Value;
    internal static Texture2D 跑步贴图 => 用新皮肤() ? TexRun2.Value : TexRun.Value;
    internal static Texture2D 战斗手臂贴图 => 用新皮肤() ? CombatArmTexture2.Value : CombatArmTexture.Value;
    internal static Texture2D 摸头贴图 => (用新皮肤() && PetpetSheet2 != null && PetpetSheet2.Value != null) ? PetpetSheet2.Value : PetpetSheet.Value;

    //梦云水晶：背后光环动画（3030f60x60 横排
    private static Asset<Texture2D> HaloSheet;
    //低血庇护：周身蓝色光圈（非恋还是练，血<20%无敌时环绕）
    private static Asset<Texture2D> ShieldRingTex;
    //摸摸：petpet 动画中072x56 横排
    private static Asset<Texture2D> PetpetSheet;

    //摸摸动画状态：npc.whoAmI -> 剩余tick
    internal static readonly Dictionary<int, int> PetTicks = new();
    internal const int PetAnimationTicks = 50;    //1010f* 5tick=0.83s，播放更
    internal const int PetSlimeSecondTick = 12;   //2tick播第二声史莱姆落
    private const int PetpetFrameW = 72;
    private const int PetpetFrameH = 56;
    private const int PetpetTicksPerFrame = 5;

    //低血庇护：when HP < 20% max 常驻20%减伤 + 短暂无敌，冷0s
    private static readonly Dictionary<int, int> 低血无敌tick = new();   //剩余无敌
    private static readonly Dictionary<int, int> 低血无敌冷却 = new();    //剩余冷却
    private static readonly Dictionary<int, int> 好痛台词冷却 = new();    //“好痛”台词冷却
    private static readonly Dictionary<int, int> 低血传送冷却= new();    //血20%传送回玩家的冷却（0s0s排队说
    private static readonly Dictionary<int, int> 连续受击计数 = new();    //短时间连续受击计数（用于近战躲避/传送）
    private static readonly Dictionary<int, int> 连续受击计时 = new();    //受击计数窗口计时
    private static readonly Dictionary<int, int> 存活好感计时 = new();    //每存在一1好感（活着且在世界上）
    private const int 一天tick = 86400;   //一整天（白黑夜）的tick
    internal static readonly Dictionary<int, int> 鼠标停留tick = new();  //鼠标悬停在酒狐身上的连续tick
    private static readonly Dictionary<int, int> 随机聊天计时 = new();   //非战斗随机聊天（0s一次，头顶显示
    private static readonly string[] 好痛台词 = {
        "酒狐：好痛……呜……",
        "酒狐：好疼！下手轻点啦！",
        "酒狐：呜哇，好痛好痛……",
        "酒狐：疼疼疼！要哭了……"
    };

    //复活之后的善后：重置“低0%生命的无敌”冷却（让复活完能立刻再触发低血无敌），
    //并给一小段复活保护，避免复活当帧又被后续伤害打打成未激活
    //（死亡复活/ 不死图腾 / 绀珠之药都走这里；键不存在= 已冷却好
    internal static void 复活保障(NPC fox)
    {
        if (fox == null) return;
        低血无敌冷却.Remove(fox.whoAmI);
        低血无敌tick.Remove(fox.whoAmI);
        复活保护tick[fox.whoAmI] = 120;   //2秒复活保
    }

    //复活保护：剩余保护tick0 时免疫伤害）
    private static readonly Dictionary<int, int> 复活保护tick = new();

    //行走动画：用"是否在移（速度+位移）驱动，避免 velocity.X 单值判断失
    private static readonly Dictionary<int, float> lastMoveX = new();
    private static readonly HashSet<int> movingNow = new();

    //摸摸爱心特效
    private static Asset<Texture2D> HeartTex;
    private sealed class HeartP { public Vector2 Offset; public float Life; public float Scale; }
    private static readonly Dictionary<int, List<HeartP>> heartFx = new();

    //表情贴图（和 PetpetSheet 一样的 ModContent.Request 加载方式
    internal static readonly Asset<Texture2D>[] EmoteAssets = new Asset<Texture2D>[20];

    public override void Load()
    {
        TexStand = ModContent.Request<Texture2D>("酒狐npc仆从/Content/Images/酒狐/zhanli");
        TexRun = ModContent.Request<Texture2D>("酒狐npc仆从/Content/Images/酒狐/paobu");
        CombatArmTexture = ModContent.Request<Texture2D>("酒狐npc仆从/Content/Images/酒狐/Armor_zhandou");
        HaloSheet = ModContent.Request<Texture2D>("酒狐npc仆从/Content/Images/酒狐/dream_halo_1_spritesheet_big");
        ShieldRingTex = ModContent.Request<Texture2D>("酒狐npc仆从/Content/Images/酒狐/blue_shield_ring");
        PetpetSheet = ModContent.Request<Texture2D>("酒狐npc仆从/Content/Images/酒狐/petpet_sheet");
        HeartTex = ModContent.Request<Texture2D>("酒狐npc仆从/Content/Images/酒狐/heart");
        //新皮肤贴图（形参同尺寸：站立40x56 / 跑步120x56 / 战斗手臂240x56
        //  加载失败不影响原皮肤：解析时统一回退
        try { TexStand2 = ModContent.Request<Texture2D>("酒狐npc仆从/Content/Images/酒狐/新皮肤/zhanli"); } catch { TexStand2 = null; }
        try { TexRun2 = ModContent.Request<Texture2D>("酒狐npc仆从/Content/Images/酒狐/新皮肤/paobu"); } catch { TexRun2 = null; }
        try { CombatArmTexture2 = ModContent.Request<Texture2D>("酒狐npc仆从/Content/Images/酒狐/新皮肤/Armor_zhandou"); } catch { CombatArmTexture2 = null; }
        try { PetpetSheet2 = ModContent.Request<Texture2D>("酒狐npc仆从/Content/Images/酒狐/新皮肤/petpet_sheet"); } catch { PetpetSheet2 = null; }

        //表情贴图：与酒狐其它贴图同一方式加载（请Asset，绘制时.Value
        for (int i = 0; i < EmoteAssets.Length; i++)
        {
            string num = (i + 1).ToString("D2");
            try { EmoteAssets[i] = ModContent.Request<Texture2D>($"酒狐npc仆从/Content/Images/酒狐/emote_{num}"); }
            catch { EmoteAssets[i] = null; }
        }
    }

    public override void Unload()
    {
        TexStand = null;
        TexRun = null;
        CombatArmTexture = null;
        TexStand2 = null;
        TexRun2 = null;
        CombatArmTexture2 = null;
        HaloSheet = null;
        ShieldRingTex = null;
        PetpetSheet = null;
        PetpetSheet2 = null;
        HeartTex = null;
        PetTicks.Clear();
        lastMoveX.Clear();
        movingNow.Clear();
        heartFx.Clear();
        低血无敌tick.Clear();
        低血无敌冷却.Clear();
        复活保护tick.Clear();
        好痛台词冷却.Clear();
        低血传送冷却.Clear();
        连续受击计数.Clear();
        连续受击计时.Clear();
        存活好感计时.Clear();
        鼠标停留tick.Clear();
        随机聊天计时.Clear();
        酒狐头顶文本.Clear();
    }

    //新生成的酒狐（首次召/ 寻风之铃复活 / 重进世界重生）：清掉可能残留的同槽位状态，
    //避免上一只酒狐留下的冷却/计时在复用同一whoAmI 时继续生效
    public override void OnSpawn(Terraria.DataStructures.IEntitySource source)
    {
        酒狐NPC状态.清除收纳标记(NPC);   //新生成的酒狐：清掉“被魂符收纳”标记（槽位可能被复用）
        复活保障(NPC);
        低血传送冷却.Remove(NPC.whoAmI);
        好痛台词冷却.Remove(NPC.whoAmI);
        连续受击计数.Remove(NPC.whoAmI);
        连续受击计时.Remove(NPC.whoAmI);
        随机聊天计时.Remove(NPC.whoAmI);
    }

    //开始摸摸：播放一petpet 动画（从头开始），伴小黄鸭叫 + 爱心特效
    //30%概率让摸摸加好感0%概率再加1点；加好感后80s冷却
    public static void StartPet(int npcIndex)
    {
        if (npcIndex < 0 || npcIndex >= Main.maxNPCs) return;
        NPC npc = Main.npc[npcIndex];
        if (!npc.active) return;
        PetTicks[npcIndex] = PetAnimationTicks;
        SoundEngine.PlaySound(SoundID.Duck, npc.Center);   //小黄鸭叫
        //抚摸好感0%概率+1，加好感后80s冷却才能再加
        酒狐玩家.摸摸好感(npc);
    }

    //每次摸摸触发少量爱心特效
    public static void TriggerHearts(int npcIndex)
    {        if (npcIndex < 0 || npcIndex >= Main.maxNPCs) return;
        NPC npc = Main.npc[npcIndex];
        if (!npc.active) return;
        if (!heartFx.TryGetValue(npcIndex, out List<HeartP> list))
        {
            list = new List<HeartP>();
            heartFx[npcIndex] = list;
        }
        for (int i = 0; i < 3; i++)
        {
            list.Add(new HeartP
            {
                Offset = new Vector2(Main.rand.NextFloat(-26f, 26f), Main.rand.NextFloat(-34f, -14f)),
                Life = 50f,
                Scale = Main.rand.NextFloat(0.6f, 1.0f)
            });
        }
    }

    //判断酒狐是否处在地表（高于地下层；带3格滞回，避免在表层线附近上下抖动导致闪烁
    private static readonly Dictionary<int, bool> surfaceLatch = new();
    private bool OnSurface()
    {
        bool wasSurf = surfaceLatch.TryGetValue(NPC.whoAmI, out bool s) ? s : false;
        bool surf;
        if (wasSurf)
            surf = NPC.Center.Y < (Main.worldSurface + 3f) * 16f;   //之前在地表：需下潜>3格才算地
        else
            surf = NPC.Center.Y < (Main.worldSurface - 3f) * 16f;   //之前在地下：需上浮>3格才算地
        surfaceLatch[NPC.whoAmI] = surf;
        return surf;
    }

    //火把状态（按需求：天黑 非地表[地下/洞穴=暗环境] 拿火把并保持；直到“上午且回到地表”才重置熄灭
    //纯用“时深度”判定，不采样光照，因此酒狐自己的火光绝不会造成反馈抖动
    private static readonly Dictionary<int, bool> torchLatch = new();
    private bool torchOnNow;   //本帧是否手拿火把（AI算好，PreDraw直接读）

    private bool TorchActive()
    {
        bool day = Main.dayTime;
        bool surface = OnSurface();
        bool on = torchLatch.TryGetValue(NPC.whoAmI, out bool v) ? v : false;
        if (on)
        {
            //已拿火把：只在【上+ 地表】才重置熄灭，否则一直保
            if (day && surface) on = false;
        }
        else
        {
            //没拿火把：遇到【天黑】或【非地表(地下/暗环境】就点亮并保
            if (!day || !surface) on = true;
        }
        torchLatch[NPC.whoAmI] = on;
        return on;
    }

    //动画常量
    public const int FrameWidth = 40;
    public const int FrameHeight = 56;
    public const int RunFrameCount = 3;

    //取一帧的源矩形：自动适配"竖排"横排"两种贴图布局
    //40 竖排（y = index*56）；宽≥80 横排（x = index*4040x56
    //原版 Armor_zhandou 是横40x56，旧代码按竖排取帧，导致攻击~5全部取到贴图
    internal static Rectangle 取帧区域(Texture2D tex, int index)
    {
        if (tex != null && tex.Width >= FrameWidth * 2)
            return new Rectangle(index * FrameWidth, 0, FrameWidth, FrameHeight);
        return new Rectangle(0, index * FrameHeight, FrameWidth, FrameHeight);
    }

    //NPC.ai数组约定
    //NPC.ai[0] 攻击动画计时2tick)
    //NPC.ai[1] 攻击类型标记=无攻击；1=法术远程=近战挥砍
    //NPC.ai[2] 回血计时
    //NPC.ai[3] dash冲刺计时

    public override void SetStaticDefaults()
    {
        Main.npcFrameCount[Type] = RunFrameCount;
        NPCID.Sets.SpawnsWithCustomName[Type] = true;
        NPCID.Sets.NPCBestiaryDrawOffset.Add(Type, new NPCID.Sets.NPCBestiaryDrawModifiers
        {
            Velocity = 0f,
            Direction = 1
        });
        //让酒狐像城镇NPC一样显示在地图/小地图上（不townNPC，保持自定义仆从行为
        NPCID.Sets.ActsLikeTownNPC[Type] = true;
        //注册小地图头像贴图（用酒狐立绘裁出的头）
        HeadSlot = Terraria.ModLoader.NPCHeadLoader.GetHeadSlot("酒狐npc仆从/Content/Images/酒狐/酒狐头");
    }

    //小地图上城镇NPC头像槽位
    internal static int HeadSlot = -1;

    public override void SetDefaults()
    {
        NPC.width = 34;
        NPC.height = 50;
        NPC.damage = 12;
        NPC.defense = 50;
        NPC.lifeMax = 250;
        NPC.knockBackResist = 0.95f;
        NPC.friendly = true;
        NPC.townNPC = false;
        NPC.aiStyle = 0; //自定义仆从AI
        NPC.HitSound = SoundID.NPCHit1;
        NPC.DeathSound = SoundID.NPCDeath1;
        NPC.value = Item.buyPrice(silver: 50);
    }

    public override bool CanTownNPCSpawn(int numTownNPCs)
    {
        return false;
    }

    //★【永不消失】原NPC.CheckActive() 会在“附近没有玩+ timeLeft 耗尽”时把NPC设为不激
    //（表现为酒狐离玩家太远就消失，退出重进才会在 OnEnterWorld 里重新召出）
    //返回 false 会让 NPCLoader.CheckActive 直接否决这次“清理”，酒狐就一直存在
    //注：Main.DoUpdateInWorld 对每active NPC 都会调用 UpdateNPC，不受距离限制，
    //    所以不消失之后 AI 仍会正常跑（距离太远时会返回/瞬移 逻辑拉回玩家身边）
    public override bool CheckActive() => false;

    public override bool CanChat()
    {
        return true;
    }

    public override string GetChat()
    {
        int ownerPlayerIndex = (int)NPC.localAI[1];
        if (Main.LocalPlayer.whoAmI != ownerPlayerIndex)
        {
            Main.CloseNPCChatOrSign();
            return "";
        }
        //手持食物/恢复药剂 右键即喂食，不打开UI
        Player p = Main.LocalPlayer;
        if (p != null && !p.HeldItem.IsAir && (p.HeldItem.buffType > 0 || p.HeldItem.healLife > 0))
        {
            p.GetModPlayer<酒狐玩家>().尝试喂食(p.HeldItem);
            Main.CloseNPCChatOrSign();
            return "";
        }
        //鼠标需在酒狐身上停留足够久(.5s)才打开UI，避免近距离误触（例如右键使用道具时
        bool 停留够久 = 鼠标停留tick.TryGetValue(NPC.whoAmI, out int ht) && ht >= 30;
        if (!停留够久)
        {
            Main.CloseNPCChatOrSign();
            return "";   //未停留足够久：不开UI，聊天文本留白
        }
        酒狐互动UI.Open(NPC.whoAmI);
        Main.CloseNPCChatOrSign();
        return "";   //聊天文本留白（台词改由头顶随机显示）
    }

    internal static string GetRandomChat()
    {
        return Main.rand.Next(12) switch
        {
            0 => "今天也要好好生活呀。",
            1 => "如果累了，就在这里歇一会儿吧。",
            2 => "风里有一点甜甜的味道。",
            3 => "最近的旅途还顺利吗？",
            4 => "我会记得你说过的话。",
            5 => "这里的星星比以前看见的更亮。",
            6 => "别忘了偶尔停下来休息。",
            7 => "今天适合在附近走走。",
            8 => "有需要的话，随时叫我。",
            9 => "我刚刚听见了很远的铃声。",
            10 => "希望你的背包里总有好吃的。",
            _ => "有我在，不用担心夜里的风。"
        };
    }

    public override void AI()
    {
        //====鼠标是否悬停在酒狐身上（累计停留时间，用于“停留后才右键开UI”的防误触）====
        if (!Main.dedServ && Main.myPlayer >= 0)
        {
            bool 悬停 = NPC.Hitbox.Contains(new Point(Main.mouseX + (int)Main.screenPosition.X, Main.mouseY + (int)Main.screenPosition.Y));
            int cur = 鼠标停留tick.TryGetValue(NPC.whoAmI, out int hv) ? hv : 0;
            鼠标停留tick[NPC.whoAmI] = 悬停 ? cur + 1 : 0;
        }

        //====头顶表情：放最前面优先执行，防止后续代码抛错跳===
        try { 酒狐表情.Update(NPC); } catch { }

        //====【只存在一只酒狐】若同一主人已有一只酒狐，则本只自===
        if (Main.netMode != NetmodeID.MultiplayerClient)
        {
            Player ownerP = 酒狐NPC状态.GetTargetPlayer(NPC);
            if (ownerP != null)
            {
                int count = 0, firstIndex = -1;
                for (int i = 0; i < Main.maxNPCs; i++)
                {
                    NPC n = Main.npc[i];
                    if (n.active && n.type == ModContent.NPCType<酒狐>() && (int)n.localAI[1] == ownerP.whoAmI)
                    {
                        count++;
                        if (firstIndex < 0) firstIndex = i;
                    }
                }
                if (count > 1 && firstIndex >= 0 && firstIndex != NPC.whoAmI)
                {
                    //保留最早一只，其余自毁
                    NPC.active = false;
                    NPC.life = 0;
                    NPC.netUpdate = true;
                    return;
                }
            }
        }

        //====服务端防护：血量大强制不能消失====
        if (Main.netMode != NetmodeID.MultiplayerClient)
        {
            if (NPC.life > 0 && !NPC.active)
            {                NPC.active = true;
                NPC.netUpdate = true;
            }
        }

        //====【严格保底】只要酒狐血量为0/非激活，就尝试用复活饰品救回（每tick检查，确保一定执行）====
        if (Main.netMode != NetmodeID.MultiplayerClient)
        {
            Player rvOwner = 酒狐NPC状态.GetTargetPlayer(NPC);
            if (rvOwner != null && (NPC.life <= 0 || !NPC.active) && 酒狐饰品.有复活饰(rvOwner, true))
            {
                if (酒狐饰品.尝试复活(rvOwner, true, NPC))
                {
                    NPC.life = Math.Max(1, (int)(NPC.lifeMax * 0.30f));
                    NPC.active = true;
                    NPC.netUpdate = true;
                    rvOwner.GetModPlayer<酒狐玩家>().FoxDead = false;
                    复活保障(NPC);   //复活后重置低血无敌冷却
                }
            }
        }

        Player targetPlayer = 酒狐NPC状态.GetTargetPlayer(NPC);

        int desiredLifeMax = 250 + 酒狐玩家.GetLevel(targetPlayer) * 200;
        bool 梦云水晶 = targetPlayer.GetModPlayer<酒狐玩家>().HasDreamCrystalEquipped();
        if (梦云水晶) desiredLifeMax *= 3;   //梦云水晶变身：最大生命200%
        if (酒狐饰品.酒狐佩戴(targetPlayer, ModContent.ItemType<救赎之戒>()))
            desiredLifeMax = (int)(desiredLifeMax * 1.5f);   //救赎之戒：酒狐最大生50%
        if (酒狐饰品.酒狐佩戴(targetPlayer, ModContent.ItemType<流转之心>()))
            desiredLifeMax = (int)(desiredLifeMax * 1.10f);  //流转之心：酒狐最大生10%
        if (NPC.lifeMax != desiredLifeMax)
        {
            NPC.lifeMax = desiredLifeMax;
            NPC.life = Math.Min(NPC.life + 200, NPC.lifeMax);
            NPC.netUpdate = true;
        }
        //酒狐享用查看界面装备的护甲防
        int desiredDefense = 50 + targetPlayer.GetModPlayer<酒狐玩家>().GetArmorDefense();
        //烬华之戒：酒狐额15防御
        if (酒狐饰品.酒狐佩戴(targetPlayer, ModContent.ItemType<烬华之戒>()))
            desiredDefense += 15;
        //紫荆冠刺：酒狐防御力+15
        if (酒狐饰品.酒狐佩戴(targetPlayer, ModContent.ItemType<紫荆冠刺>()))
            desiredDefense += 15;
        //流转之心：酒狐防御力+5%
        if (酒狐饰品.酒狐佩戴(targetPlayer, ModContent.ItemType<流转之心>()))
            desiredDefense = (int)(desiredDefense * 1.05f);
        //持有近战武器：防御力 +20 +50%
        if (酒狐攻击.是近战武器(targetPlayer.GetModPlayer<酒狐玩家>().当前武器))
        {
            desiredDefense += 20;
            desiredDefense = (int)(desiredDefense * 1.5f);
        }

        //====樱眷发簪：持续增益（抗火/免疫中毒/生命恢复/铁皮/免疫岩浆等）====
        bool 发簪 = 酒狐饰品.酒狐佩戴(targetPlayer, ModContent.ItemType<樱眷发簪>());
        if (发簪)
        {
            desiredDefense += 8;                                   //铁皮(+8
            NPC.lavaImmune = true;                                 //免疫岩浆
            NPC.buffImmune[BuffID.OnFire] = true;
            NPC.buffImmune[BuffID.Poisoned] = true;
            NPC.buffImmune[BuffID.Cursed] = true;
            NPC.lifeRegen += 8;                                    //生命恢复提升
        }
        //====救赎之戒：酒狐持续生命恢===
        if (酒狐饰品.酒狐佩戴(targetPlayer, ModContent.ItemType<救赎之戒>()))
            NPC.lifeRegen += 6;
        //====流转之心：酒狐加速自然生命恢===
        if (酒狐饰品.酒狐佩戴(targetPlayer, ModContent.ItemType<流转之心>()))
            NPC.lifeRegen += (int)(NPC.lifeRegen * 0.4f) + 3;
        //====磐石水晶：酒狐高额抗击退====
        if (酒狐饰品.酒狐佩戴(targetPlayer, ModContent.ItemType<磐石水晶>()))
            NPC.knockBackResist = 0f;   //完全免疫击退（磐石）
        //====梦云水晶变身：护100%100 + 生命恢复 + 免疫所有负面buff + 自然生命恢复+100%====
        if (梦云水晶)
        {
            desiredDefense = desiredDefense * 2 + 100;          //护甲防+100% +100
            NPC.lifeRegen += 15;                                //生命恢复
            for (int b = 0; b < BuffID.Count; b++)               //免疫所有负面buff
                if (Main.debuff[b]) NPC.buffImmune[b] = true;
            NPC.lifeRegen *= 2;                                  //自然生命恢复+100%
        }
        if (NPC.defense != desiredDefense)
            NPC.defense = desiredDefense;

        酒狐NPC状态.Update(NPC);
        酒狐攻击.Update(NPC);
        //重力兜底：放在所有移动逻辑之后，确保酒狐不会因为任何路径“无视重力浮空
        try { 酒狐NPC状态.重力兜底(NPC); } catch { }

        //====恋还是练：任务期间酒狐全程可被玩家攻击（friendly=false），挑衅后再转攻玩家====
        if (酒狐任务执行.恋还是练激活(NPC))
            NPC.friendly = false;
        else
            NPC.friendly = true;

        //====任务执行引擎：驱动任务状态机与具体任务行====
        酒狐任务执行.UpdateStatusText(NPC);   //头顶任务状态文本计时衰
        if (Main.netMode != NetmodeID.MultiplayerClient)
        {
            //任务引擎里的 WorldGen 修改可能抛异常，一旦逃逸会让酒狐被销毁；try/catch 兜底，防止酒狐“消失之后
            try { 酒狐任务执行.Update(NPC, targetPlayer); }
            catch (Exception e)
            {
                if (!Main.dedServ)
                    酒狐任务执行.状态异常白(e);
            }
        }

        //====梦云水晶变身：酒狐移动速度+20%（在 酒狐NPC状态跑对目标速度加成，不直接缩放velocity，避免Y/重力被放大飞起）====

        //====灵巧闪避：附近有敌对弹幕时自动闪开（坐下除外）====
        if (酒狐NPC状态.GetMode(NPC) != 酒狐状态.坐下)
            酒狐NPC状态.尝试闪避(NPC);

        //====投蛋糕：玩家未满血时，每隔28秒朝玩家扔一块治愈蛋===
        if (Main.netMode != NetmodeID.MultiplayerClient)
            酒狐NPC状态.更新投蛋糕(NPC, targetPlayer);

        //====头顶台词系统：每tick先跑一次（决定本tick“台词计时器”是否允许倒计时）====
        //必须在下面所有台词类计时器之前调
        try { 酒狐头顶文本.Update(NPC, targetPlayer); } catch { }

        //====酒狐闲聊：讨食冷+ 玩家背包有食物则委婉讨要====
        酒狐NPC状态.更新闲聊冷却(NPC);
        酒狐NPC状态.讨要食物(NPC, targetPlayer);

        //====寻宝提醒：附近出现自然宝生命水晶/生命果时提醒玩家，概率赐寻宝buff====
        酒狐NPC状态.更新寻宝提醒(NPC, targetPlayer);

        //====梦云水晶变身：以酒狐为中心周期性发射闪水晶弹幕====
        if (梦云水晶) 梦水晶攻击.Update(NPC, targetPlayer);

        //====特殊武器特效（天顶剑/棱镜/鞭子===
        酒狐武器特效.Update(NPC);
        if (酒狐武器特效.IsChanneling(NPC))
            NPC.velocity = Vector2.Zero;   //终极棱镜蓄力时站

        //====摸摸动画：停下被+ 小黄鸭叫====
        if (PetTicks.TryGetValue(NPC.whoAmI, out int petLeft) && petLeft > 0)
        {
            NPC.velocity = Vector2.Zero;   //停下，方便被
            //声小黄鸭叫：在动画中
            if (petLeft == PetAnimationTicks - PetSlimeSecondTick)
                SoundEngine.PlaySound(SoundID.Duck, NPC.Center);
            if (petLeft <= 1)
                PetTicks.Remove(NPC.whoAmI);
            else
                PetTicks[NPC.whoAmI] = petLeft - 1;
        }

        //摸摸爱心：上飘并淡化
        if (heartFx.TryGetValue(NPC.whoAmI, out List<HeartP> hl))
        {
            for (int i = hl.Count - 1; i >= 0; i--)
            {
                HeartP h = hl[i];
                h.Life -= 1f;
                h.Offset.Y -= 0.7f;
                if (h.Life <= 0f) hl.RemoveAt(i);
            }
            if (hl.Count == 0) heartFx.Remove(NPC.whoAmI);
        }

        //====【每3秒回血逻辑80tick=3秒；坐下/死亡不回血；服务端执行====
        //ai[2]与连跳次数共用打包存储（见酒狐NPC状GetHealTimer/SetHealTimer
        酒狐状态 outerMode = 酒狐NPC状态.GetMode(NPC);
        if (NPC.life > 0 && outerMode != 酒狐状态.坐下)
        {
            float healTimer = 酒狐NPC状态.GetHealTimer(NPC) + 1f;
            if (healTimer >= 180f)
            {
                酒狐NPC状态.SetHealTimer(NPC, 0f);
                if (Main.netMode != NetmodeID.MultiplayerClient && NPC.life < NPC.lifeMax)
                {
                    //回复最大生命%（芳心织囊：自然生命恢复翻倍）
                    int healAmount = (int)Math.Round(NPC.lifeMax * 0.05);
                    if (酒狐饰品.酒狐佩戴(targetPlayer, ModContent.ItemType<芳心织囊>()))
                        healAmount *= 2;
                    if (酒狐饰品.酒狐佩戴(targetPlayer, ModContent.ItemType<流转之心>()))
                        healAmount = (int)(healAmount * 1.2f);
                    NPC.life += healAmount;
                    if (NPC.life > NPC.lifeMax) NPC.life = NPC.lifeMax;
                    NPC.netUpdate = true;

                    //客户端：生成回血粒子、飘
                    if (Main.netMode != NetmodeID.Server)
                    {
                        //【修复：GoldSparkle DustID.GoldSpa
                        for (int i = 0; i < 12; i++)
                        {
                            Vector2 dustPos = NPC.Center + Main.rand.NextVector2Circular(18,22);
                            Dust d = Dust.NewDustPerfect(dustPos, DustID.Gold);
                            d.velocity = new Vector2(0, -Main.rand.NextFloat(1.2f,2.4f));
                            d.noGravity = true;
                            d.scale = Main.rand.NextFloat(0.6f,1.1f);
                        }
                        //绿色回血浮动文字
                        CombatText.NewText(NPC.Hitbox, Color.LimeGreen, $"+{healAmount}", true);
                    }
                }
            }
            else
            {
                酒狐NPC状态.SetHealTimer(NPC, healTimer);
            }
        }

        //====酒狐喝药水：受伤且背包有治疗药水时使用（间隔10s，消瓶）====
        if (Main.netMode != NetmodeID.MultiplayerClient && outerMode != 酒狐状态.坐下)
            targetPlayer.GetModPlayer<酒狐玩家>().酒狐喝药水(NPC);

        //====酒狐主动进食：背武器槽里有食物时，进食冷却一好就自己吃掉（效果同被喂食）====
        if (Main.netMode != NetmodeID.MultiplayerClient && outerMode != 酒狐状态.坐下)
            targetPlayer.GetModPlayer<酒狐玩家>().酒狐主动进食(NPC);

        //====非战斗随机聊天：脱离战斗时每0s排队说一句原聊天台词（头顶显示）====
        if (Main.netMode != NetmodeID.MultiplayerClient && NPC.life > 0 && NPC.active && outerMode != 酒狐状态.坐下)
        {
            //战斗手/ 脱战等待期内：计时器暂停（计时值保持不变），脱战满5s后才继续累加
            if (!酒狐头顶文本.台词计时器可走(NPC))
            {
                //暂停：什么都不做（保留已累计的时间）
            }
            else
            {
                int ct = 随机聊天计时.TryGetValue(NPC.whoAmI, out int cv) ? cv + 1 : 1;
                随机聊天计时[NPC.whoAmI] = ct;
                if (ct >= 60 * 60)   //0s 才会入队一句闲聊（配合排队间隔，实际间隔≈60s
                {
                    随机聊天计时[NPC.whoAmI] = 0;
                    酒狐头顶文本.排队说话(NPC, GetRandomChat());
                }
            }
        }

        //====存活好感：酒狐每在世界上存活一整天，好感度+1，并在左下角提示====
        if (Main.netMode != NetmodeID.MultiplayerClient && NPC.life > 0 && NPC.active
            && targetPlayer != null && targetPlayer.active && !targetPlayer.GetModPlayer<酒狐玩家>().FoxDead)
        {
            int t = 存活好感计时.TryGetValue(NPC.whoAmI, out int v) ? v + 1 : 1;
            存活好感计时[NPC.whoAmI] = t;
            if (t >= 一天tick)
            {
                存活好感计时[NPC.whoAmI] = 0;
                targetPlayer.GetModPlayer<酒狐玩家>().Affection += 1;
                if (Main.netMode != NetmodeID.Server)
                {
                    Main.NewText($"酒狐：陪了你一整天，好感度+1（{targetPlayer.GetModPlayer<酒狐玩家>().Affection}）", new Color(255, 160, 200));
                    CombatText.NewText(NPC.Hitbox, new Color(255, 160, 200), "+好感", true);
                }
            }
        }

        //低血庇护计时衰减（无敌倒计+ 冷却倒计+ “好痛”台词冷却）
        if (复活保护tick.TryGetValue(NPC.whoAmI, out int rp) && rp > 0)
        {
            if (rp - 1 <= 0) 复活保护tick.Remove(NPC.whoAmI);
            else 复活保护tick[NPC.whoAmI] = rp - 1;
        }
        if (低血无敌tick.TryGetValue(NPC.whoAmI, out int bInv))
        {
            低血无敌tick[NPC.whoAmI] = bInv - 1;
            if (低血无敌tick[NPC.whoAmI] <= 0) 低血无敌tick.Remove(NPC.whoAmI);
        }
        if (低血无敌冷却.TryGetValue(NPC.whoAmI, out int bCd))
        {
            低血无敌冷却[NPC.whoAmI] = bCd - 1;
            if (低血无敌冷却[NPC.whoAmI] <= 0) 低血无敌冷却.Remove(NPC.whoAmI);
        }
        if (好痛台词冷却.TryGetValue(NPC.whoAmI, out int hpCd))
        {
            好痛台词冷却[NPC.whoAmI] = hpCd - 1;
            if (好痛台词冷却[NPC.whoAmI] <= 0) 好痛台词冷却.Remove(NPC.whoAmI);
        }
        if (低血传送冷却.TryGetValue(NPC.whoAmI, out int lpCd))
        {
            低血传送冷却[NPC.whoAmI] = lpCd - 1;
            if (低血传送冷却[NPC.whoAmI] <= 0) 低血传送冷却.Remove(NPC.whoAmI);
        }
        //血20%触发一次“传送回玩家身边”，冷却好0s(3000tick)
        if (Main.netMode != NetmodeID.MultiplayerClient
            && NPC.life > 0 && NPC.life < (int)(NPC.lifeMax * 0.20f)
            && !低血传送冷却.ContainsKey(NPC.whoAmI)
            && outerMode != 酒狐状态.坐下)
        {
            低血传送冷却[NPC.whoAmI] = 3000;
            酒狐NPC状态.TeleportToPlayer(NPC, targetPlayer);
            if (!Main.dedServ)
            {
                for (int i = 0; i < 12; i++)
                {
                    Dust d = Dust.NewDustPerfect(NPC.Center, DustID.Silver, Main.rand.NextVector2Circular(-2f, -2f), 0, new Color(160, 200, 255), 0.8f);
                    d.noGravity = true;
                }
            }
        }
        //====“好痛”台词：血20% 就触发一次（独立判定，不再依赖低血无敌/对练任务期间不===
        //冷却30s；冷却倒数【不受战斗影响】（唯一例外，战斗中照常倒数
        if (NPC.life > 0 && NPC.life < (int)(NPC.lifeMax * 0.20f)
            && !好痛台词冷却.ContainsKey(NPC.whoAmI))
        {
            好痛台词冷却[NPC.whoAmI] = 30 * 60;
            if (Main.netMode != NetmodeID.Server)
                酒狐头顶文本.直接说话(NPC, 好痛台词[Main.rand.Next(好痛台词.Length)]);
        }

        //触发检测：血量低于最大生0% 不在无敌 冷却已好 触发短暂无敌
        //修复：原写法“低血无敌冷却.TryGetValue(...) && cd <= 0”，而冷却归零时该键会被
        //   Remove 掉，导致 TryGetValue 永远返回 false 整段低血无敌从来没触发过
        //   正确判定是“键不存在（=已冷却好）或 剩余<=0”
        if (Main.netMode != NetmodeID.MultiplayerClient
            && !低血无敌tick.ContainsKey(NPC.whoAmI)
            && (!低血无敌冷却.TryGetValue(NPC.whoAmI, out int cd) || cd <= 0)
            && NPC.life > 0 && NPC.life < (int)(NPC.lifeMax * 0.20f))
        {
            bool 恋还是练 = 酒狐任务执行.恋还是练激活(NPC);
            //恋还是练：默.5秒；否则延长0
            低血无敌tick[NPC.whoAmI] = 恋还是练 ? Main.rand.Next(120, 181) : 600;
            低血无敌冷却[NPC.whoAmI] = 30 * 60;                    //冷却30s
            if (!Main.dedServ)
            {
                for (int i = 0; i < 16; i++)
                {
                    Dust d = Dust.NewDustPerfect(NPC.Center, DustID.Gold, Main.rand.NextVector2Circular(-3f, -3f), 0, new Color(255, 240, 160), 1.2f);
                    d.noGravity = true;
                }
            }
        }

        //攻击计时器更
        if (NPC.ai[0] > 0)
        {
            NPC.ai[0] -= 1;
            if (NPC.ai[0] <= 0)
            {
                NPC.ai[1] = 0;
                NPC.netUpdate = true;
            }
        }

        //计算"是否在移：速度或位移任一大即视为移动（更稳）
        float prevMoveX = lastMoveX.TryGetValue(NPC.whoAmI, out float pmx) ? pmx : NPC.position.X;
        lastMoveX[NPC.whoAmI] = NPC.position.X;
        bool isMoving = Math.Abs(NPC.velocity.X) > 0.1f || Math.Abs(NPC.position.X - prevMoveX) > 0.05f;
        if (isMoving) movingNow.Add(NPC.whoAmI); else movingNow.Remove(NPC.whoAmI);

        //行走/站立动画逻辑：攻击时冻结跑步
        if (NPC.ai[0] <= 0)
        {
            NPC.frameCounter += 1.0;
            if (isMoving)
            {
                //速度快→跑步动画正常tick/帧）；速度慢→放慢一半（12tick/帧）
                int frameInterval = Math.Abs(NPC.velocity.X) > 2.0f ? 6 : 12;
                if (NPC.frameCounter >= frameInterval)
                {
                    NPC.frameCounter = 0;
                    int currentFrameIndex = (int)(NPC.frame.Y / FrameHeight);
                    currentFrameIndex++;
                    if (currentFrameIndex >= RunFrameCount)
                        currentFrameIndex = 0;
                    NPC.frame.Y = currentFrameIndex * FrameHeight;
                }
            }
            else
            {
                NPC.frameCounter = 0;
                NPC.frame.Y = 0;
            }
        }

        NPC.spriteDirection = NPC.direction;

        //移动粒子
        if (!Main.dedServ && Math.Abs(NPC.velocity.X) > 0.5f && Main.rand.NextBool(5))
        {
            int dustType = DustID.Cloud;
            int dust = Dust.NewDust(NPC.position + new Vector2(0f, NPC.height - 8f), NPC.width, 8, dustType, -NPC.velocity.X * 0.2f, -0.5f, 120, Color.White, 0.7f);
            Main.dust[dust].noGravity = true;
        }

        //====【梦云水晶】装备后：背后更亮更大的闪烁光效（无实体粒子，摘下即无）====
        if (Main.netMode != NetmodeID.MultiplayerClient && 酒狐NPC状态.GetTargetPlayer(NPC).GetModPlayer<酒狐玩家>().HasDreamCrystalEquipped())
        {
            if (!Main.dedServ)
            {
                //更亮更大的青色闪烁光（保留闪烁）
                float pulse = 0.9f + 0.4f * MathF.Sin(Main.GameUpdateCount * 0.09f);
                Lighting.AddLight(NPC.Center + new Vector2(0f, -6f), new Vector3(0.5f * pulse, 0.95f * pulse, 1.35f * pulse));
            }        }

        //====【黑暗环境手拿火把】仅渲染 + 照明，不占任何槽===
        torchOnNow = TorchActive();
        if (torchOnNow)
        {
            if (!Main.dedServ)
            {
                //光亮（点火把），轻微闪烁只作视觉；把亮度调高、范围放大（照明更亮
                float flick = 0.92f + 0.08f * MathF.Sin(Main.GameUpdateCount * 0.14f);
                Lighting.AddLight(NPC.Center + new Vector2(0f, -6f), new Vector3(1.25f * flick, 0.98f * flick, 0.56f * flick));
            }
        }

        //====【语音】（容错===
        try { 酒狐语音.Update(NPC); } catch { }

        //====骑扫帚贴身：把酒狐锁定到玩家身后，不移动（覆盖所有移动结算）====
        if (酒狐NPC状态.骑扫帚贴身(NPC))
        {
            Player p = targetPlayer;
            if (p != null && p.active && 酒狐NPC状态.玩家骑扫帚(p))
            {
                //玩家身后：面向玩家后
                Vector2 behind = p.Center + new Vector2(-p.direction * 46f, -6f);
                NPC.position = behind - new Vector2(NPC.width / 2f, NPC.height / 2f);
                NPC.velocity = Vector2.Zero;
                NPC.netUpdate = true;
            }
            else
            {
                酒狐NPC状态.清除骑扫帚(NPC);   //玩家下扫帚恢复原样
            }
        }
    }

    public override void OnHitByItem(Player player, Item item, NPC.HitInfo hit, int damageDone)
    {
        player.GetModPlayer<酒狐玩家>().MarkHostile(NPC);
        //恋还是练：玩家打了酒挑衅，转打玩
        酒狐任务执行.玩家伤了酒狐(NPC);
        //紫荆冠刺：受到伤害全额返还伤害者（对练不触发，反弹到酒狐当前敌人）
        紫荆反射(damageDone);
    }

    //【修复：泛型类型错误，把projectile.owner变量替换为类名酒狐玩家
    public override void OnHitByProjectile(Projectile projectile, NPC.HitInfo hit, int damageDone)
    {
        if (projectile.owner >= 0 && projectile.owner < Main.maxPlayers)
        {
            Main.player[projectile.owner].GetModPlayer<酒狐玩家>().MarkHostile(NPC);
            酒狐任务执行.玩家伤了酒狐(NPC);
        }
        紫荆反射(damageDone);
    }

    // 紫荆冠刺：把受到的伤害全额返还给酒狐当前锁定的敌人（对练任务期间不反弹）
    private void 紫荆反射(int damageDone)
    {
        if (damageDone <= 0) return;
        Player owner = 酒狐NPC状态.GetTargetPlayer(NPC);
        if (owner == null) return;
        if (酒狐任务执行.恋还是练激活(NPC)) return;   //对练不反弹（避免无限反弹主人）
        if (!酒狐饰品.酒狐佩戴(owner, ModContent.ItemType<紫荆冠刺>())) return;
        if (酒狐攻击.CurrentTargetIndex < 0 || 酒狐攻击.CurrentTargetIndex >= Main.maxNPCs) return;
        NPC target = Main.npc[酒狐攻击.CurrentTargetIndex];
        if (target == null || !target.active || target.dontTakeDamage) return;
        target.SimpleStrikeNPC(damageDone, NPC.direction, false, 0f, DamageClass.Generic);
    }

    // 樱眷发簪：来袭伤害减20%+20%*好感等级, 最0%)；不死图腾绀珠之药：伤害先拦
    public override void ModifyIncomingHit(ref NPC.HitModifiers modifiers)
    {
        Player owner = 酒狐NPC状态.GetTargetPlayer(NPC);
        if (owner == null) return;

        //本次伤害“减伤前”的数值，用于最后做 90% 减伤上限
        float 原始伤害 = modifiers.FinalDamage.ApplyTo(0f);
        if (原始伤害 <= 0f) 原始伤害 = modifiers.SourceDamage.ApplyTo(0f);

        //复活保护：刚复活（不死图腾绀珠之药死亡复活）的2秒内免疫伤害，避免复活当帧又被打
        if (复活保护tick.TryGetValue(NPC.whoAmI, out int 保护) && 保护 > 0)
        {
            modifiers.SourceDamage = new StatModifier(0f, 0f, 0f, 0f);
            modifiers.FinalDamage = new StatModifier(0f, 0f, 0f, 0f);
            modifiers.TargetDamageMultiplier = modifiers.TargetDamageMultiplier * 0f;
            return;
        }

        //====连续受击躲避：短时间内被连续击中（每80tick窗口内受击≥6次）传送到玩家身边====
        if (Main.netMode != NetmodeID.MultiplayerClient && !酒狐任务执行.恋还是练激活(NPC))
        {
            int 窗口 = 连续受击计时.TryGetValue(NPC.whoAmI, out int w) ? w : 0;
            if (窗口 <= 0) { 连续受击计数[NPC.whoAmI] = 0; 连续受击计时[NPC.whoAmI] = 80; }
            else 连续受击计时[NPC.whoAmI] = 窗口 - 1;

            int cnt = 连续受击计数.TryGetValue(NPC.whoAmI, out int c) ? c + 1 : 1;
            连续受击计数[NPC.whoAmI] = cnt;
            if (cnt >= 6)   //3 次改6 
            {
                连续受击计数[NPC.whoAmI] = 0;
                连续受击计时[NPC.whoAmI] = 0;
                酒狐NPC状态.TeleportToPlayer(NPC, owner);
                if (Main.netMode != NetmodeID.Server)
                    for (int i = 0; i < 10; i++)
                    {
                        Dust d = Dust.NewDustPerfect(NPC.Center, DustID.Silver, Main.rand.NextVector2Circular(-2f, -2f), 0, new Color(160, 200, 255), 0.8f);
                        d.noGravity = true;
                    }
            }
        }

        // 恋还是练：对练时酒狐正常受击掉血，但单次伤害压到 最大生命0%，且绝不致死
        // 若某击会打死酒狐 拦截 + 结束任务（双方保住）。玩家可正常打出伤害（不滴血）
        if (酒狐任务执行.恋还是练激活(NPC))
        {
            float final = modifiers.FinalDamage.ApplyTo(0f);
            if (final <= 0f) final = modifiers.SourceDamage.ApplyTo(0f);
            if (final > 0f)
            {
                //致命 结束任务 + 双方保命
                if (final >= NPC.life)
                {
                    酒狐任务执行.酒狐致命保护(NPC);
                    modifiers.SourceDamage = new StatModifier(0f, 0f, 0f, 0f);
                    modifiers.FinalDamage = new StatModifier(0f, 0f, 0f, 0f);
                    modifiers.TargetDamageMultiplier = modifiers.TargetDamageMultiplier * 0f;
                    return;
                }
                //非致命：正常掉血，但单次最多打20% 最大生命（保证不死且“有来有回”）
                float cap = NPC.lifeMax * 0.20f;
                if (final > cap)
                    modifiers.FinalDamage = modifiers.FinalDamage * (cap / final);
            }
        }

        // 低血庇护：血量低于最大生0%时，
        //   a) 无敌中完全免疫伤害（零伤害）；
        //   b) 未无常驻20%任意伤害减免（梦云水晶下仍生效）
        bool lowHp = NPC.life > 0 && NPC.life < (int)(NPC.lifeMax * 0.20f);
        if (lowHp && 低血无敌tick.TryGetValue(NPC.whoAmI, out int inv) && inv > 0)
        {
            //短暂无敌：免疫任何伤
            modifiers.SourceDamage = new StatModifier(0f, 0f, 0f, 0f);
            modifiers.FinalDamage = new StatModifier(0f, 0f, 0f, 0f);
            modifiers.TargetDamageMultiplier = modifiers.TargetDamageMultiplier * 0f;
            return;
        }

        //====【优先级极高】越来源不明的伤害直接免===
        float rawFinal = modifiers.FinalDamage.ApplyTo(0f);
        if (rawFinal <= 0f) rawFinal = modifiers.SourceDamage.ApplyTo(0f);
        //任意伤害不可超过最大生命值很大倍数；来源不明、数值异常一律免
        bool 出身不明 = modifiers.DamageType == null || modifiers.DamageType == DamageClass.Generic && rawFinal < 1f;
        if (rawFinal < 0f || rawFinal > NPC.lifeMax * 8f || 出身不明)
        {
            modifiers.SourceDamage = new StatModifier(0f, 0f, 0f, 0f);
            modifiers.FinalDamage = new StatModifier(0f, 0f, 0f, 0f);
            modifiers.TargetDamageMultiplier = modifiers.TargetDamageMultiplier * 0f;
            return;
        }
        if (lowHp)
        {
            modifiers.FinalDamage = modifiers.FinalDamage * 0.8f;   //常驻20%减伤
        }

        //持有近战武器：20% 伤害减免；处于近战突刺（高速位移穿刺）时减伤再提高50%，即30%
        bool 持近战 = 酒狐攻击.是近战武器(owner.GetModPlayer<酒狐玩家>().当前武器);
        if (持近战)
        {
            float 减伤 = 0.20f;
            if (酒狐攻击.IsDashing(NPC)) 减伤 *= 1.5f;
            modifiers.FinalDamage = modifiers.FinalDamage * (1f - 减伤);
        }

        // 法术强化核心：护盾挡一次伤害（整段伤害免疫）
        if (酒狐饰品.酒狐佩戴(owner, ModContent.ItemType<法术强化核心>()) && 酒狐饰品.尝试消耗护盾(owner, true, NPC))
        {
            modifiers.SourceDamage = new StatModifier(0f, 0f, 0f, 0f);
            modifiers.FinalDamage = new StatModifier(0f, 0f, 0f, 0f);
            modifiers.TargetDamageMultiplier = modifiers.TargetDamageMultiplier * 0f;
            return;
        }

        //====梦云水晶变身时不再0%任意伤害减免 + 单次伤害不超过最大生%；并覆盖其他饰品的减===
        bool 梦云 = owner.GetModPlayer<酒狐玩家>().HasDreamCrystalEquipped();
        if (梦云)
        {
            modifiers.FinalDamage = modifiers.FinalDamage * 0.3f;   //70%减伤
            float final = modifiers.FinalDamage.ApplyTo(0f);
            if (final <= 0f) final = modifiers.SourceDamage.ApplyTo(0f);
            float cap = NPC.lifeMax * 0.05f;                       //单次最多打%最大生命（限伤增强
            if (final > cap && final > 0f)
                modifiers.FinalDamage = modifiers.FinalDamage * (cap / final);
            //受伤即回血：恢复最大生%
            if (final > 0f && NPC.life < NPC.lifeMax)
            {
                int heal = (int)(NPC.lifeMax * 0.05f);
                if (heal > 0)
                {
                    NPC.life += heal;
                    if (NPC.life > NPC.lifeMax) NPC.life = NPC.lifeMax;
                    NPC.netUpdate = true;
                }
            }
        }
        else
        {
            //未佩戴梦云水晶：才走其他饰品的减伤（樱眷发簪/紫荆冠刺近战
            if (酒狐饰品.酒狐佩戴(owner, ModContent.ItemType<樱眷发簪>()))
            {
                int level = 酒狐玩家.GetLevel(owner);
                float reduce = MathF.Min(0.2f + 0.2f * level, 0.6f);
                modifiers.FinalDamage = modifiers.FinalDamage * (1f - reduce);
            }
            if (酒狐饰品.酒狐佩戴(owner, ModContent.ItemType<紫荆冠刺>()) && modifiers.DamageType == DamageClass.Melee)
                modifiers.FinalDamage = modifiers.FinalDamage * 0.8f;
        }


        //最大伤害减90%（即实伤不低于减伤前伤害10%
        //   血< 20% 时不设这个上限，让低血庇护（无20%减伤/锁血）完整生效
        if (!lowHp && 原始伤害 > 0f)
        {
            float 现在 = modifiers.FinalDamage.ApplyTo(0f);
            float 下限 = 原始伤害 * 0.10f;
            if (现在 > 0f && 现在 < 下限)
                modifiers.FinalDamage = modifiers.FinalDamage * (下限 / 现在);
        }

        // 复活（不死图腾绀珠之药）：只在【真正致命】的一击上触发（消耗一次复活）
        //旧写法把“血量≤20%”也当成致命，导致酒狐一掉到20%以下就被复活顶回30%血
        //  复活道具被瞬间耗光；道具用完后下一击就是真酒狐消失、只能重进游戏才回来
        if (!酒狐饰品.有复活饰(owner, true)) return;
        int dmg = (int)modifiers.FinalDamage.ApplyTo(0f);
        if (dmg <= 0) dmg = (int)modifiers.SourceDamage.ApplyTo(0f);
        bool lethal = dmg > 0 && dmg >= NPC.life;
        if (lethal)
        {
            酒狐饰品.尝试复活(owner, true, NPC);
            NPC.netUpdate = true;
            复活保障(NPC);   //复活后重置低血无敌冷却
            // 显式把所有伤害字段清
            modifiers.SourceDamage = new StatModifier(0f, 0f, 0f, 0f);
            modifiers.FinalDamage = new StatModifier(0f, 0f, 0f, 0f);
            modifiers.TargetDamageMultiplier = modifiers.TargetDamageMultiplier * 0f;
        }
    }

    // 磐石水晶：酒狐受到弹幕伤害减%（梦云水晶变身时不再享受其他饰品减伤，故跳过
    public override void ModifyHitByProjectile(Projectile projectile, ref NPC.HitModifiers modifiers)
    {
        Player owner = 酒狐NPC状态.GetTargetPlayer(NPC);
        if (owner == null) return;
        if (owner.GetModPlayer<酒狐玩家>().HasDreamCrystalEquipped()) return;   //梦云水晶覆盖
        if (酒狐饰品.酒狐佩戴(owner, ModContent.ItemType<磐石水晶>()))
            modifiers.FinalDamage = modifiers.FinalDamage * 0.95f;
    }

    // 不死图腾/绀珠之药：死亡前一刻兜底复活（返回false阻止死亡
    public override bool PreKill()
    {
        // 梦云水晶变身：强制锁血，绝不真正死亡（最高优先级
        Player crystalOwner = 酒狐NPC状态.GetTargetPlayer(NPC);
        if (NPC.life <= 0 && crystalOwner != null && crystalOwner.GetModPlayer<酒狐玩家>().HasDreamCrystalEquipped())
        {
            NPC.life = Math.Max(1, (int)(NPC.lifeMax * 0.05f));   //锁血不死%最大生命
            NPC.netUpdate = true;
            if (Main.netMode != NetmodeID.Server)
                Main.NewText("酒狐：主人，我还能撑住……", new Color(150, 220, 255));
            return false;   //不死
        }
        // 恋还是练：酒狐濒结束任务 + 回满血 + 恢复友方（绝不真正死亡）
        if (NPC.life <= 0 && 酒狐任务执行.恋还是练激活(NPC))
        {
            酒狐任务执行.酒狐致命保护(NPC);
            NPC.life = Math.Max(1, NPC.life);
            NPC.lifeMax = Math.Max(NPC.lifeMax, NPC.life);
            NPC.netUpdate = true;
            return false;   //不死
        }
        if (NPC.life <= 0)
        {
            Player owner = 酒狐NPC状态.GetTargetPlayer(NPC);
            if (owner != null && 酒狐饰品.有复活饰(owner, true))
            {
                酒狐饰品.尝试复活(owner, true, NPC);
                NPC.life = Math.Max(1, (int)(NPC.lifeMax * 0.30f));
                NPC.active = true;
                NPC.netUpdate = true;
                复活保障(NPC);   //复活后重置低血无敌冷却
                return false;   //不死
            }
        }
        return true;
    }

    // 兜底：若仍被判定死亡，按「复活饰品」正常复活；没有复活饰品才真正死
    public override void OnKill()
    {
        if (NPC.life <= 0)
        {
            //梦云水晶变身：最高优先级，强制锁血不死
            Player cu = 酒狐NPC状态.GetTargetPlayer(NPC);
            if (cu != null && cu.GetModPlayer<酒狐玩家>().HasDreamCrystalEquipped())
            {
                NPC.life = Math.Max(1, (int)(NPC.lifeMax * 0.05f));
                NPC.active = true;
                NPC.netUpdate = true;
                return;
            }
            Player owner = 酒狐NPC状态.GetTargetPlayer(NPC);
            if (owner != null && 酒狐饰品.有复活饰(owner, true))
            {
                酒狐饰品.尝试复活(owner, true, NPC);
                NPC.life = (int)(NPC.lifeMax * 0.30f);
                NPC.active = true;
                NPC.netUpdate = true;
                复活保障(NPC);   //复活后重置低血无敌冷却
                return;
            }
            //没有复活饰品 酒狐真正死亡，仅标记 dead 寻风之铃 使用（不强行重生
            if (owner != null)
                owner.GetModPlayer<酒狐玩家>().FoxDead = true;
        }

        //原版话术的死亡提示：酒狐 xxx 杀死了（用原版“被杀”消息格式）
        if (NPC.life <= 0 && Main.netMode != NetmodeID.Server)
        {
            string killerName = "未知";
            if (NPC.lastInteraction >= 0 && NPC.lastInteraction < Main.maxPlayers)
                killerName = Main.player[NPC.lastInteraction].name;
            Main.NewText($"酒狐 被 {killerName} 杀死了", new Color(220, 90, 90));
            if (Main.netMode != NetmodeID.MultiplayerClient)
                Main.LocalPlayer.GetModPlayer<酒狐玩家>().FoxDead = true;
        }
    }

    public override void SetChatButtons(ref string button, ref string button2)
    {
        button = "查看";
        button2 = 酒狐NPC状态.GetName(NPC);
    }

    public override void OnChatButtonClicked(bool firstButton, ref string shopName)
    {
        if (firstButton)
        {
            酒狐互动UI.Open(NPC.whoAmI);
            Main.CloseNPCChatOrSign();
            return;
        }
        酒狐NPC状态.AdvanceMode(NPC);
        Main.CloseNPCChatOrSign();
    }

    public override void SetBestiary(BestiaryDatabase database, BestiaryEntry bestiaryEntry)
    {
        bestiaryEntry.Info.AddRange(new IBestiaryInfoElement[]
        {
            new MoonLordPortraitBackgroundProviderBestiaryInfoElement(),
            new FlavorTextBestiaryInfoElement("酒狐喜欢安静地陪在冒险者身边。")
        });
    }

    public override bool PreDraw(SpriteBatch spriteBatch, Vector2 screenPos, Color drawColor)
    {
        Vector2 drawPosition = NPC.Center - screenPos + new Vector2(0f, 4f);
        Vector2 origin = new(20f, 28f);
        SpriteEffects effects = NPC.spriteDirection == 1 ? SpriteEffects.None : SpriteEffects.FlipHorizontally;

        Player owner = 酒狐NPC状态.GetTargetPlayer(NPC);

        //====【梦云水晶】背后循环播0帧光环（置于身体之后/最底层===
        if (owner.GetModPlayer<酒狐玩家>().HasDreamCrystalEquipped())
        {
            //速度再降一倍：6tick进一帧（tick检查
            int haloFrame = (int)(Main.GameUpdateCount / 16 % 30);
            Rectangle haloSource = new(haloFrame * 120, 0, 120, 120);
            Vector2 haloOrigin = new(60f, 60f);
            //原版帧贴图：用白色中性色，保留原帧的粉配色，轻微呼吸闪烁
            float alpha = 0.95f + 0.05f * MathF.Sin(Main.GameUpdateCount * 0.09f);
            //缓缓上下循环轻轻浮动
            float floatY = MathF.Sin(Main.GameUpdateCount * 0.03f) * 6f;
            spriteBatch.Draw(HaloSheet.Value, drawPosition - new Vector2(0f, 26f + floatY), haloSource, Color.White * alpha, 0f, haloOrigin, 100f / 120f, effects, 0f);
        }

        //====摸摸动画：直接作用于酒狐本身，替代身===
        if (PetTicks.TryGetValue(NPC.whoAmI, out int petLeft) && petLeft > 0)
        {
            int petFrame = (PetAnimationTicks - petLeft) / PetpetTicksPerFrame % 10;
            Rectangle petSrc = new(petFrame * PetpetFrameW, 0, PetpetFrameW, PetpetFrameH);
            spriteBatch.Draw(摸头贴图, drawPosition, petSrc, drawColor, 0f, new Vector2(PetpetFrameW / 2f, PetpetFrameH / 2f), 1f, effects, 0f);
            酒狐表情.Draw(NPC, spriteBatch, screenPos);
            return false;
        }

        Texture2D bodyTex;
        Rectangle bodySource;

        bool isBodyMoving = movingNow.Contains(NPC.whoAmI);
        if (isBodyMoving && NPC.ai[0] <= 0)
        {
            //跑步状态，使用paobu贴图
            bodyTex = 跑步贴图;
            int frameIndex = (int)(NPC.frame.Y / FrameHeight);
            bodySource = 取帧区域(bodyTex, frameIndex);
        }
        else
        {
            //静止 / 攻击冻结 使用站立贴图zhanli（单帧）
            bodyTex = 站立贴图;
            bodySource = new Rectangle(0, 0, FrameWidth, FrameHeight);
        }

        Item weapon = owner.GetModPlayer<酒狐玩家>().当前武器;

        //====冲刺残影（近战高速位移穿刺）：条数与拖尾都加长，残影不渲染战斗手====
        if (酒狐攻击.IsDashing(NPC))
        {
            for (int index = 6; index >= 1; index--)
            {
                Vector2 ghostPosition = drawPosition - NPC.velocity * index * 0.6f;
                Color ghostColor = drawColor * (0.22f / index);
                spriteBatch.Draw(bodyTex, ghostPosition, bodySource, ghostColor, 0f, origin, 1f, effects, 0f);
            }
            //残影轮廓：速度越快越亮
            float 强度 = MathHelper.Clamp(NPC.velocity.Length() / 18f, 0f, 1f);
            for (int index = 6; index >= 1; index--)
            {
                Vector2 ghostPosition = drawPosition - NPC.velocity * index * 0.6f;
                spriteBatch.Draw(bodyTex, ghostPosition, bodySource,
                    new Color(150, 200, 255) * (0.16f * 强度 / index), 0f, origin, 1f, effects, 0f);
            }
        }

        //====远程高速换边残影：从起点到当前位置拉出一串残====
        if (酒狐攻击.换边残影计时.TryGetValue(NPC.whoAmI, out int swapTtl) && swapTtl > 0
            && 酒狐攻击.换边残影起点.TryGetValue(NPC.whoAmI, out Vector2 swapFrom))
        {
            float 相位 = 1f - MathHelper.Clamp(swapTtl / 14f, 0f, 1f);   //0
            for (int index = 1; index <= 5; index++)
            {
                //残影留在路径上，随时间淡
                float t = index / 6f + 相位 * 0.15f;
                Vector2 ghostPosition = Vector2.Lerp(swapFrom, NPC.Center, MathHelper.Clamp(t, 0f, 1f));
                ghostPosition = ghostPosition - screenPos + new Vector2(0f, 0f);
                float a = (1f - 相位) * (0.30f / index);
                spriteBatch.Draw(bodyTex, ghostPosition, bodySource, new Color(180, 220, 255) * a, 0f, origin, 1f, effects, 0f);
            }
        }

        //绘制身体
        spriteBatch.Draw(bodyTex, drawPosition, bodySource, drawColor, 0f, origin, 1f, effects, 0f);

        //====低血庇护：非恋还是练、血<20%且无敌中 周身环绕蓝色光圈（缓慢旋呼吸闪烁===
        if (!酒狐任务执行.恋还是练激活(NPC) && 低血无敌tick.TryGetValue(NPC.whoAmI, out int shInv) && shInv > 0)
        {
            float ringPulse = 0.8f + 0.2f * MathF.Sin(Main.GameUpdateCount * 0.12f);
            float ringRot = Main.GameUpdateCount * 0.02f;
            spriteBatch.Draw(ShieldRingTex.Value, drawPosition + new Vector2(0f, 8f), null,
                new Color(160, 210, 255) * ringPulse, ringRot, new Vector2(60f, 60f), 1.15f, effects, 0f);
        }

        //攻击：使用独立zhandou手臂贴图；非攻击：身体自带手
        if (NPC.ai[0] > 0)
        {
            float attackTotalTick = 22f;
            float attackProgress = 1f - (NPC.ai[0] / attackTotalTick);
            int combatArmFrameIndex;
            if (NPC.ai[1] == 1)
            {
                //法术吟唱0
                combatArmFrameIndex = (int)(attackProgress * 3f);
                combatArmFrameIndex = Math.Clamp(combatArmFrameIndex, 0, 2);
            }
            else
            {
                //近战挥砍
                combatArmFrameIndex = 3 + (int)(attackProgress * 3f);
                combatArmFrameIndex = Math.Clamp(combatArmFrameIndex, 3, 5);
            }
            Rectangle combatSource = 取帧区域(战斗手臂贴图, combatArmFrameIndex);
            spriteBatch.Draw(战斗手臂贴图, drawPosition, combatSource, drawColor, 0f, origin, 1f, effects, 0f);
        }

        DrawWeapon(spriteBatch, weapon, drawPosition, effects, drawColor, NPC.ai[0]);

        //====【黑暗环境手拿火把】渲染火把在手中（仅视觉，不占槽位）====
        if (torchOnNow)
        {
            Texture2D torchTex = TextureAssets.Item[ItemID.Torch].Value;
            Vector2 torchPos = drawPosition + new Vector2(NPC.spriteDirection * 18f, 6f);
            spriteBatch.Draw(torchTex, torchPos, null, Color.White, 0f, new Vector2(torchTex.Width / 2f, torchTex.Height / 2f), 1f, effects, 0f);
        }

        //====【特殊武器特效】天顶剑剑阵 / 棱镜光/ 鞭子（以酒狐为锚===
        酒狐武器特效.Draw(NPC, spriteBatch, screenPos);

        //====【头顶表情】绘制在酒狐头上方一小段距离====
        酒狐表情.Draw(NPC, spriteBatch, screenPos);
        DrawHearts(spriteBatch, screenPos);   //喂食小爱
        DrawTaskStatus(spriteBatch, screenPos);   //头顶任务状态文本
        try { 酒狐头顶文本.Draw(NPC, spriteBatch, screenPos); } catch { }   //头顶台词（浮现动画）

        return false;
    }

    //头顶任务状态文本：任务状态变化时短暂浮现
    private void DrawTaskStatus(SpriteBatch spriteBatch, Vector2 screenPos)
    {
        if (Main.dedServ) return;
        if (!酒狐任务执行.头顶有状态文本(NPC, out string txt, out float alpha)) return;
        if (alpha <= 0f) return;

        Vector2 pos = NPC.Center - screenPos + new Vector2(0f, -(NPC.height / 2f + 58f));
        Vector2 size = FontAssets.MouseText.Value.MeasureString(txt);
        pos -= new Vector2(size.X / 2f, 0f);
        //描边 + 填充
        Utils.DrawBorderString(spriteBatch, txt, pos, new Color(255, 225, 140) * alpha, 0.8f);
    }

    private void DrawHearts(SpriteBatch spriteBatch, Vector2 screenPos)
    {
        if (HeartTex == null) return;
        if (!heartFx.TryGetValue(NPC.whoAmI, out List<HeartP> hl)) return;
        Vector2 basePos = NPC.Center - screenPos;
        foreach (HeartP h in hl)
        {
            float alpha = MathHelper.Clamp(h.Life / 50f, 0f, 1f);
            spriteBatch.Draw(HeartTex.Value, basePos + h.Offset, null, Color.White * alpha * 0.95f, 0f, new Vector2(12f, 12f), h.Scale, SpriteEffects.None, 0f);
        }
    }

    private void DrawWeapon(SpriteBatch spriteBatch, Item weapon, Vector2 drawPosition, SpriteEffects effects, Color drawColor, float attackTimer)
    {
        if (weapon.IsAir || weapon.type <= ItemID.None || weapon.type >= TextureAssets.Item.Length)
            return;
        Texture2D texture = TextureAssets.Item[weapon.type].Value;
        // 下调武器位置：从 -2（略偏上）降+10，贴合手部下方握持位
        Vector2 handBaseOffset = new Vector2(NPC.spriteDirection * 14f, 10f);
        float attackFraction = 0f;
        if (attackTimer > 0)
        {
            attackFraction = 1f - attackTimer / 22f;
        }
        float baseRot = NPC.spriteDirection == 1 ? 0.35f : -0.35f;
        float attackRotOffset;
        if (NPC.spriteDirection == 1)
        {
            attackRotOffset = MathF.Sin(attackFraction * MathF.PI) * 1.1f;
        }
        else
        {
            attackRotOffset = -MathF.Sin(attackFraction * MathF.PI) * 1.1f;
        }
        float totalRotation = baseRot + attackRotOffset;
        Vector2 weaponOffset = handBaseOffset;
        if (attackTimer > 0)
        {
            weaponOffset.Y -= MathF.Sin(attackFraction * MathF.PI) * 6f;
        }
        Vector2 weaponPosition = drawPosition + weaponOffset;
        Vector2 weaponOrigin = new(texture.Width / 2f, texture.Height / 2f);
        spriteBatch.Draw(texture, weaponPosition, null, drawColor, totalRotation, weaponOrigin, 0.8f, effects, 0f);
    }
}

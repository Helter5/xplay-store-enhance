// ==UserScript==
// @name         XPLAY.GG Store Enhance (EUR + Colored Prices)
// @version      2.1.5
// @description  Steam prices in EUR, correct calculation, colored UI, stable queue
// @author       Treasure
// @match        https://xplay.gg/*
// @grant        window.onurlchange
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      steamcommunity.com
// @noframes
// ==/UserScript==

(function() {
    'use strict';

    GM_addStyle(`
        .xse_addon_button{
            display:inline-block;
            padding:0.5em 0.8em;
            margin:1em 0.7em 0 0;
            color:white;
            background-color:#282d32;
            border-radius:1em;
            text-align:center;
            position:relative;
            z-index:9999;
            pointer-events:auto;
        }
        .xse_addon_button a{color:#6ecbff;text-decoration:none}
        .xse_addon_button:hover{cursor:pointer;opacity:.85}
        .xse_addon_priceTag{
            display:inline;
            position:relative;
            z-index:9999;
            color:#7CFC9A;
        }
        .xse_price_error{
            color:#ff7b7b;
        }
        .xse_addon_loadAll{
            color:white;
            position:fixed;
            bottom:4em;
            right:2em;
            z-index:10000;
        }
    `);

    window.addEventListener("load", siteLoadHandler, { once: true });
    window.addEventListener("newurl", siteLoadHandler);
    window.addEventListener("pagechange", siteLoadHandler);

    if (window.onurlchange === null) {
        window.addEventListener("urlchange", e => {
            window.dispatchEvent(new CustomEvent("newurl",{detail:{url:e.url}}));
        });
    } else {
        let oldURL = location.href;
        setInterval(() => {
            if (location.href !== oldURL) {
                oldURL = location.href;
                window.dispatchEvent(new CustomEvent("newurl",{detail:{url:oldURL}}));
            }
        }, 200);
    }

    const mainObserver = new MutationObserver(() => {
        clearTimeout(window.__xseSpaTimer);
        window.__xseSpaTimer = setTimeout(() => {
            siteLoadHandler({ type: "pagechange", detail: { url: location.href } });
        }, 300);
    });

    window.addEventListener("load", () => {
        const main = document.querySelector("main");
        if (main) mainObserver.observe(main, { childList: true, subtree: true });
    });

    const emptyShowcaseMsgs = [
        "Showcase is empty","Cellule vide","Zelle leer","A bemutató üres",
        "Komórka pusta","Ячейка пуusta","El escaparate está vacío"
    ];

    function checkForPageType(url){
        if (/\/store/.test(url)) return "store";
        if (/\/profile\/inventory/.test(url)) return "inventory";
        return "another";
    }

    function siteLoadHandler(e){
        const delay = 400;
        const url = e.detail?.url || e.target?.URL || location.href;

        switch (checkForPageType(url)){
            case "store":
                setTimeout(setButtonListeners, delay);
                setTimeout(execute, delay, getStoreElements, getStoreShowcaseClasses, getStoreFullShowcases);
                break;
            case "inventory":
                setTimeout(execute, delay, getInventoryElements, getInventoryShowcaseClasses, getInventoryFullShowcases);
                break;
            default:
                setTimeout(removeLoadAllButton, delay);
        }
    }

    function execute(getElements, getClasses, getFull){
        let elements, classes;

        const populated = new Promise((resolve, reject)=>{
            function retry(i=0){
                if(i>=25) return reject();
                elements = getElements();
                classes = getClasses(elements);
                if(classes[0][1]===0) return setTimeout(()=>retry(i+1),200);
                resolve();
            }
            retry();
        });

        populated.then(()=>{
            const full = getFull(elements, classes[0][0]);
            const attrs = full.map(getItemAttributes);
            attrs.forEach(a=>{
                setNameColors(a);
                addShowcaseButtons(a);
            });
            addLoadAllButton(full);
        }).catch(()=>{});
    }

    function getStoreElements(){
        try{
            const m=document.getElementsByTagName("main")[0];
            const s=Array.from(m.children[0].children[2].children[0].children[3].children);
            const a=Array.from(m.children[0].children[2].children[0].children[4].children);
            if(s.length>=a.length) return s;
            moveAuctionTimers(a);
            return a;
        }catch{return[];}
    }

    function getInventoryElements(){
        try{
            return Array.from(document.getElementsByTagName("main")[0]
                .children[0].children[1].children[2].children[0]
                .children[0].children[0].children[1].children[0].children);
        }catch{return[];}
    }

    function getStoreShowcaseClasses(elements){
        let full=["",0], empty=["",0];
        elements.forEach(e=>{
            if(e.children.length>=6){full=[e.className,full[1]+1];}
            else if(emptyShowcaseMsgs.includes(e.innerText)){empty=[e.className,empty[1]+1];}
        });
        return full[1]+empty[1]>=20?[full,empty]:[["",0],["",0]];
    }

    function getInventoryShowcaseClasses(elements){
        let full=["",0], empty=["",0];
        elements.forEach(e=>{
            if(e.children[0]?.children.length>=6){full=[e.className,full[1]+1];}
            else if(emptyShowcaseMsgs.includes(e.innerText)){empty=[e.className,empty[1]+1];}
        });
        return [full,empty];
    }

    function getStoreFullShowcases(elements,cls){return elements.filter(e=>e.className===cls);}
    function getInventoryFullShowcases(elements,cls){return elements.filter(e=>e.className===cls).map(e=>e.children[0]);}

    function getItemAttributes(el){
        const c=el.childNodes;
        const typeEl=c[1].firstChild;
        const skinEl=c[2];
        const condEl=c[3];
        const priceEl=c[1].lastChild;

        const st=typeEl.innerText.includes("StatTrak");
        const sv=typeEl.innerText.includes("Souvenir");

        let skin=skinEl.innerText.split("\n")[0].replace(/\sPhase\s\d$/,"");
        let txt=`${typeEl.innerText} | ${skin} (${condEl.innerText})`;

        let hash=encodeURI(txt)
            .replace("%u2122","%e2%84%a2")
            .replace("%u2605","%e2%98%85")
            .replace("'","%27");

        return [el,st,sv,Number(priceEl.innerText),hash];
    }

    function addShowcaseButtons(a){
        if(a[0].__xseInjected) return;
        a[0].style.height="auto";
        a[0].append(createSteamMarketButton(a[4]));
        a[0].append(createLoadPriceButton(a[4],a[3]));
        a[0].__xseInjected = true;
    }

    function createSteamMarketButton(hash){
        const b=document.createElement("div");
        b.className="xse_addon_button";
        b.innerHTML=`<a href="https://steamcommunity.com/market/listings/730/${hash}" target="_blank">Steam Market ↗</a>`;
        b.addEventListener("click",e=>e.stopPropagation());
        return b;
    }

    const queue=[]; let busy=false;

    function createLoadPriceButton(hash,xcoin){
        const b=document.createElement("div");
        b.className="xse_addon_button";
        b.innerText="Load Price";
        b.addEventListener("click",e=>{
            e.stopPropagation();
            queue.push({hash,xcoin,b});
            runQueue();
        });
        return b;
    }

    function runQueue(){
        if(busy||!queue.length)return;
        busy=true;
        const j=queue.shift();
        fetchPrice(j).finally(()=>{
            setTimeout(()=>{busy=false;runQueue();},700);
        });
    }

    function fetchPrice({hash,xcoin,b},r=0){
        b.innerText="Loading...";
        b.style.backgroundColor="transparent";

        return new Promise(res=>{
            GM_xmlhttpRequest({
                method:"GET",
                // currency=3 => EUR
                url:`https://steamcommunity.com/market/priceoverview/?appid=730&currency=3&market_hash_name=${hash}`,
                onload:x=>{
                    try{
                        const d=JSON.parse(x.responseText);

                        if(!d.success){
                            b.innerText="Steam API limit";
                            b.classList.add("xse_price_error");
                            return res();
                        }

                        if(!d.lowest_price){
                            b.innerText="No Steam data";
                            b.classList.add("xse_price_error");
                            return res();
                        }

                        // Handle comma decimal locales
                        const steamEUR=parseFloat(
                            d.lowest_price
                                .replace("€","")
                                .replace(",",".")
                                .replace(/[^\d.]/g,"")
                        );

                        const ratio=Math.max(0.01, steamEUR/1000).toFixed(2);

                        const t=document.createElement("div");
                        t.className="xse_addon_priceTag";
                        t.innerHTML=`€${steamEUR.toFixed(2)} <small>(${ratio}/1k)</small>`;
                        b.parentNode.append(t);
                        b.remove();
                        res();
                    }catch{
                        b.innerText="Steam error";
                        b.classList.add("xse_price_error");
                        res();
                    }
                },
                onerror:()=>{
                    b.innerText="Steam error";
                    b.classList.add("xse_price_error");
                    res();
                }
            });
        });
    }

    function addLoadAllButton(elements){
        removeLoadAllButton();
        const b=document.createElement("div");
        b.className="xse_addon_button xse_addon_loadAll";
        b.innerHTML="Load all<br>EUR prices";
        b.onclick=()=>{
            elements.forEach(e=>{
                if(e.lastChild?.innerText==="Load Price")e.lastChild.click();
            });
            b.remove();
        };
        document.body.appendChild(b);
    }

    function removeLoadAllButton(){
        document.querySelectorAll(".xse_addon_loadAll").forEach(e=>e.remove());
    }

    function setNameColors(e){
        const el=e[0].children[1].firstChild;
        if(e[1])el.style.color="orangered";
        if(e[2])el.style.color="gold";
    }

    function setButtonListeners(){
        try{
            const m=document.getElementsByTagName("main")[0].children[0].children[2].children[0];
            const btns=[m.children[2],m.children[1].children[0],m.lastChild.children[1].children[0]];
            const search=m.children[2].children[1].children[0].children[1].children[1];
            const h=()=>{
                btns.forEach(b=>b.removeEventListener("click",h));
                search.removeEventListener("keydown",h);
                window.dispatchEvent(new CustomEvent("pagechange",{detail:{url:location.href}}));
            };
            btns.forEach(b=>b.addEventListener("click",h));
            search.addEventListener("keydown",h);
        }catch{}
    }

    function moveAuctionTimers(elements){
        elements.forEach(e=>{
            if(e.children[5])e.children[5].style='bottom:5em;';
        });
    }
})();


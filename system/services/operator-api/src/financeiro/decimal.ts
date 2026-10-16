export class ErroFinanceiro extends Error {}
const LIMIT=10n**18n;
export function unidades(v:unknown,scale:number,positive=false):bigint{
 if(typeof v!=="string"||v.length>20||!new RegExp(`^(0|[1-9][0-9]*)(\\.[0-9]{1,${scale}})?$`).test(v))throw new ErroFinanceiro("Decimal inválido.");
 const [a,b=""]=v.split('.');const n=BigInt(a+b.padEnd(scale,'0'));if(n>=LIMIT||(positive&&n===0n))throw new ErroFinanceiro("Decimal fora da faixa.");return n;
}
export function formatar(n:bigint,s:number){if(n<0n||n>=LIMIT)throw new ErroFinanceiro("Total fora da faixa.");const v=n.toString().padStart(s+1,'0');return v.slice(0,-s)+'.'+v.slice(-s);}
export function arredondar(n:bigint,d:number){const k=10n**BigInt(d);return (n+k/2n)/k;}
export function validarEdicao(v:unknown){
 if(!v||typeof v!=="object"||Array.isArray(v))throw new ErroFinanceiro("Objeto inválido.");const x=v as Record<string,unknown>;
 if(Object.keys(x).some(k=>!["versaoEsperada","quantidade","precoUnitario"].includes(k))||!Number.isInteger(x.versaoEsperada)||Number(x.versaoEsperada)<0||Number(x.versaoEsperada)>=2147483647)throw new ErroFinanceiro("Versão inválida.");
 const q=unidades(x.quantidade,4,true),p=unidades(x.precoUnitario,4);
 return {versaoEsperada:x.versaoEsperada as number,quantidade:formatar(q,4),precoUnitario:formatar(p,4),precoTotal:formatar(arredondar(q*p,4),4)};
}
export function totais(items:string[],frete:string,desconto:string,tributos:string){
 const subtotal=arredondar(items.reduce((s,x)=>s+unidades(x,4),0n),2);
 const total=subtotal+unidades(frete,2)-unidades(desconto,2)+unidades(tributos,2);
 return {subtotal:formatar(subtotal,2),valorTotal:formatar(total,2)};
}

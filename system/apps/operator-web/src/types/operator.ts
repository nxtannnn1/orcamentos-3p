export type ReviewStatus="PENDENTE"|"APROVADO"|"REJEITADO";
export interface OfficialMaterial{id:string;code:string;name:string;family:string;unit:string}
export interface BudgetItem{id:string;budgetId:string;itemNumber:number;originalDescription:string;quantity:number;unit:string;unitPrice:number;totalPrice:number;suggestedMaterial:OfficialMaterial|null;approvedMaterial:OfficialMaterial|null;observation:string;reviewStatus:ReviewStatus}
export interface Budget{id:string;code:string;number:string;supplier:string|null;date:string;status:"EM_REVISAO"|"CONCLUIDO";itemCount:number;reviewedCount:number}
export type ItemDecision={action:"APPROVE";approvedMaterial:OfficialMaterial;observation:string}|{action:"REJECT";approvedMaterial:null;observation:string};
